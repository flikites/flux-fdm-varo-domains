const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const https = require("https");

const {
  findMostCommonResponse,
  getWorkingNodes,
  checkConnection,
  getTlds,
  api,
} = require("./utils");

const agent = new https.Agent({
  rejectUnauthorized: false,
});

const axiosInstance = axios.create({
  httpsAgent: agent,
});

async function checkIP({ app_name, app_port, domain_names }) {
  try {
    // Select working nodes
    const randomFluxNodes = await getWorkingNodes();
    const randomUrls = randomFluxNodes.map(
      (ip) => `https://${ip}:16128/apps/location/${app_name}`
    );

    const requests = randomUrls.map((url) =>
      axiosInstance.get(url).catch((error) => {
        console.log(`Error while making request to ${url}: ${error}`);
      })
    );

    const responses = await Promise.all(requests).catch((error) => {
      console.log(`Error while making concurrent requests: ${error}`);
    });

    let responseData = [];
    for (let i = 0; i < responses.length; i++) {
      if (responses[i] && responses[i].data) {
        const data = responses[i].data.data;
        responseData.push(data.map((item) => item.ip));
      }
    }

    // Find the most common IPs
    const commonIps = findMostCommonResponse(responseData).map((ip) => {
      if (ip.includes(":")) {
        return ip.split(":")[0];
      }
      return ip;
    });

    // Find healthy IPs
    const healthyIps = await findHealthyIps(commonIps, app_port);
    console.log(`[App: ${app_name}] Healthy IPs: `, healthyIps);

    if (healthyIps?.length) {
      const { records, zone } = await getZoneAndRecords(
        app_name,
        app_port,
        healthyIps,
        domain_names[0] // Using first domain for zone determination
      );

      await processDomainNames(
        domain_names,
        healthyIps,
        records,
        zone,
        app_port
      );
    } else {
      console.log(`[App: ${app_name}] No healthy IPs found. Exiting.`);
    }
  } catch (error) {
    console.error(`[App: ${app_name}] Error: ${error?.message ?? error}`);
  }
}

async function findHealthyIps(commonIps, app_port) {
  const healthyIps = [];
  for (const ip of commonIps) {
    try {
      await checkConnection(ip, app_port);
      const isGoodIp = await checkIpQuality(ip);
      if (isGoodIp) {
        healthyIps.push(ip);
      }
    } catch (error) {
      console.log(`Excluding unhealthy IP: ${ip}`);
    }
  }
  return healthyIps;
}

async function checkIpQuality(ip) {
  const apiCheckEnabled = process.env.API_CHECK_ENABLED === "true";

  if (apiCheckEnabled) {
    try {
      console.log("checking ip quality score for ip ", ip);
      const { data } = await axios.get(
        `https://www.ipqualityscore.com/api/json/ip/${process.env.IP_QUALITY_KEY}/${ip}?strictness=2`
      );
      // console.log("clean data ", data);
      if (
        data.proxy ||
        data.vpn ||
        data.recent_abuse ||
        data.tor ||
        data.fraud_score >= 74
      ) {
        return false;
      }
      return true;
    } catch (error) {
      console.log("ipquality check failed for ip ", ip);
      console.log("ip quality error ", error?.message ?? error);
    }
  }
  return true;
}

async function processDomainNames(
  domain_names,
  healthyIps,
  records,
  zone,
  app_port
) {
  for (const [index, domainName] of domain_names.entries()) {
    const ip = index < healthyIps.length ? healthyIps[index] : healthyIps[0];
    try {
      await updateDnsRecord(ip, records, domainName, zone, app_port);
    } catch (error) {
      console.log(
        `Error processing domain ${domainName}: ${error?.message ?? error}`
      );
    }
  }
}

async function updateDnsRecord(
  selectedIp,
  records,
  domain_name,
  zone_name,
  app_port
) {
  const record = records.find((r) => r.name === domain_name);

  if (!record) {
    console.log(
      `Creating new record for IP: ${selectedIp} for domain ${domain_name}`
    );
    await api.post("", {
      action: "addRecord",
      zone: zone_name,
      type: "A",
      name: domain_name,
      content: selectedIp,
    });
    console.log(
      `Created new record for IP: ${selectedIp} for domain ${domain_name}`
    );
  } else if (record.content !== selectedIp) {
    console.log(
      `Updating record for ${domain_name} from ${record.content} to ${selectedIp}`
    );
    await api.post("", {
      action: "updateRecord",
      zone: zone_name,
      record: record.id,
      column: "content",
      value: selectedIp,
    });
    console.log(
      `Updated record for ${domain_name} from ${record.content} to ${selectedIp}`
    );
  } else {
    console.log(
      `Record for ${domain_name} already exists with correct IP: ${selectedIp}`
    );
  }
}

async function getZoneAndRecords(app_name, port, healthyIps, domain_name) {
  let zone = "";
  let records = [];
  const ICANN_TLDS = await getTlds();

  try {
    function getRootDomain(domain) {
      const parts = domain.split(".");
      const tld = parts[parts.length - 1];

      if (ICANN_TLDS.includes(tld)) {
        if (parts.length < 2) return domain;
        return parts.slice(-2).join(".");
      } else {
        return tld;
      }
    }

    let rootDomain = getRootDomain(domain_name);
    console.log(`[App: ${app_name}]  Root domain: ${rootDomain}`);

    // Get or create zone
    const { data } = await api.post("", { action: "getZones" });
    let existingZone = null;
    if (data.data) {
      existingZone = data.data.find((z) => z.name === rootDomain);
    }

    if (existingZone) {
      zone = existingZone.id;
      console.log(`Zone exists: ${rootDomain}:${zone}`);
    } else {
      const { data: newZoneData } = await api.post("", {
        action: "createZone",
        domain: rootDomain,
      });
      zone = newZoneData.data.zone;
      console.log(`Zone created: ${zone} for ${rootDomain}`);
    }

    // Get and verify records
    const { data: recordsData } = await api.post("", {
      action: "getRecords",
      zone,
    });

    records = (recordsData.data ?? []).filter(async (record) => {
      try {
        await checkConnection(record.content, port);
        return true;
      } catch (error) {
        console.log(`Bad record detected: ${record.content}`);
        return false;
      }
    });

    return { records, zone };
  } catch (error) {
    console.log(`Zone management error: ${error?.message ?? error}`);
    return { records, zone };
  }
}

module.exports = {
  checkIP,
};
