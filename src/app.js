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

const logger = {
  info: (component, message) => console.log(`[${component}] INFO: ${message}`),
  error: (component, message) =>
    console.error(`[${component}] ERROR: ${message}`),
  warn: (component, message) =>
    console.warn(`[${component}] WARNING: ${message}`),
  debug: (component, message) =>
    console.log(`[${component}] DEBUG: ${message}`),
};

const agent = new https.Agent({
  rejectUnauthorized: false,
});

const axiosInstance = axios.create({
  httpsAgent: agent,
});

async function checkIP({ app_name, app_port, domain_names }) {
  try {
    // Try primary and backup endpoints first
    const masterIP = await getMasterIP(app_name, app_port);

    if (masterIP) {
      console.log(
        `found master ip for app ${app_name}, port: ${app_port}, master_ip: ${masterIP}`
      );
      await processDomainNames(app_name, app_port, domain_names, [masterIP]);
    } else {
      // Fallback to getting IPs from nodes if endpoints fail
      await fallbackToNodeIPs(app_name, app_port, domain_names);
    }
  } catch (error) {
    console.error(`[App: ${app_name}] Error: ${error?.message ?? error}`);
  }
}

async function getMasterIP(app_name, app_port) {
  try {
    // Try primary endpoint
    const primaryUrl = `https://${app_name}_${app_port}.app.runonflux.io/status`;
    try {
      const response = await axiosInstance.get(primaryUrl);
      if (response.data && response.data.masterIP) {
        console.log(`Primary endpoint success: ${primaryUrl}`);
        return response.data.masterIP;
      }
    } catch (error) {
      console.log(`Primary endpoint failed: ${error.message}`);
      console.log(`primary url ${primaryUrl}`);
    }

    // Try backup endpoint
    const backupUrl = `https://${app_name}_${app_port}.app2.runonflux.io/status`;
    try {
      const response = await axiosInstance.get(backupUrl);
      if (response.data && response.data.masterIP) {
        console.log(`Backup endpoint success: ${primaryUrl}`);
        return response.data.masterIP;
      }
    } catch (error) {
      console.log(`Backup endpoint failed: ${error.message}`);
      console.log(`backup url ${backupUrl}`);
    }

    return null;
  } catch (error) {
    console.log(`Failed to get master IP: ${error.message}`);
    return null;
  }
}

async function fallbackToNodeIPs(app_name, app_port, domain_names) {
  console.log("using fallback fallbackToNodeIPs");
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

  const responses = await Promise.all(requests);

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

  // Try to get master IP from each common IP
  for (const ip of commonIps) {
    try {
      const response = await axios.get(`http://${ip}:${app_port}/status`);
      if (response.data && response.data.masterIP) {
        await processDomainNames(app_name, app_port, domain_names, [
          response.data.masterIP,
        ]);
        console.log(`fallback master ip updated ${response.data.masterIP}`);
        return;
      }
    } catch (error) {
      console.log(
        `Failed to get status from IP http://${ip}:${app_port}/status: ${error.message}`
      );
    }
  }
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
  app_name,
  app_port,
  domain_names,
  healthyIps
) {
  for (const domainName of domain_names) {
    const { records, zone } = await getZoneAndRecords(
      app_name,
      app_port,
      domainName
    );
    try {
      await updateDnsRecord(healthyIps[0], records, domainName, zone);
    } catch (error) {
      console.log(
        `Error processing domain ${domainName}: ${error?.message ?? error}`
      );
    }
  }
}

async function updateDnsRecord(selectedIp, records, domain_name, zone_name) {
  logger.info("DNS", `Processing DNS record update for domain: ${domain_name}`);

  try {
    const record = records.find((r) => r.name === domain_name);

    if (!record) {
      logger.info(
        "DNS",
        `Creating new DNS record for ${domain_name} with masterIP ${selectedIp}`
      );
      const response = await api.post("", {
        action: "addRecord",
        zone: zone_name,
        type: "A",
        name: domain_name,
        content: selectedIp,
      });
      console.log(response.data);
      logger.info(
        "DNS",
        `Successfully created new DNS record for ${domain_name}`
      );
      return;
    }

    if (record.content !== selectedIp) {
      logger.info(
        "DNS",
        `Updating DNS record for ${domain_name} from ${record.content} to ${selectedIp}`
      );
      const response = await api.post("", {
        action: "updateRecord",
        zone: zone_name,
        type: "A",
        name: domain_name,
        content: selectedIp,
        id: record.uuid,
      });
      console.log(response.data);
      logger.info(
        "DNS",
        `Successfully updated DNS record for ${domain_name} oldIP: ${record.content} new masterIP ${selectedIp}`
      );
    } else {
      logger.info(
        "DNS",
        `No update needed for ${domain_name}, masterIP unchanged (${selectedIp})`
      );
    }
  } catch (error) {
    logger.error(
      "DNS",
      `Failed to update DNS record for ${domain_name}: ${error.message}`
    );
    throw error;
  }
}

async function getZoneAndRecords(app_name, port, domain_name) {
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
    console.log(`[App: ${app_name}] Root domain: ${rootDomain}`);

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
      const rs1 = await api.post("", {
        action: "createZone",
        domain: rootDomain,
      });
      console.log("[create zone response");
      console.log(rs1.data);
      zone = rs1.data.data.zone;
      console.log(`Zone created: ${zone} for ${rootDomain}`);
    }

    // Get records and check their health
    const { data: recordsData } = await api.post("", {
      action: "getRecords",
      zone,
    });

    // Check health of all records
    const recordPromises = (recordsData.data ?? []).map(async (record) => {
      try {
        let isHealthy = await checkConnection(record.content, port);
        console.log("isHealthy ", isHealthy);
        // Only check IP quality if API_CHECK_ENABLED is true

        if (
          process.env.API_CHECK_ENABLED === "true" ||
          (process.env.API_CHECK_ENABLED == true && isHealthy === true)
        ) {
          const isGoodIp = await checkIpQuality(record.content);
          isHealthy = isGoodIp;
        }

        return {
          ...record,
          isHealthy,
        };
      } catch (error) {
        console.log(
          `Bad record detected: ${record.content} - ${error.message}`
        );
        return {
          ...record,
          isHealthy: false,
        };
      }
    });

    records = await Promise.all(recordPromises);

    return { records, zone };
  } catch (error) {
    console.log(`Zone management error: ${error?.message ?? error}`);
    return { records, zone };
  }
}

module.exports = {
  checkIP,
};
