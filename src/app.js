const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const https = require("https");

// Assuming that these utility functions are correctly defined in './utils'
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

async function checkIP({ app_name, app_port, domain_name }) {
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

    const { records, zone } = await getZoneAndRecords(
      domain_name,
      app_port,
      app_name
    );
    console.log("app_name: ", app_name);
    console.log("app_port: ", app_port);
    console.log("Flux Consensus IP list for app: ", commonIps);
    console.log("DNS server returned records: ", records);

    for (const ip of commonIps) {
      try {
        await createOrDeleteRecord(ip, records, app_port, domain_name, zone);
      } catch (error) {
        console.log(error?.message ?? error);
      }
    }
  } catch (error) {
    console.error(error?.message ?? error);
  }
}

async function createOrDeleteRecord(
  selectedIp,
  records = [],
  app_port,
  domain_name,
  zone_name
) {
  // Get the value of the environment variable (default to false if not set)
  const apiCheckEnabled = process.env.API_CHECK_ENABLED === "true";

  // Define a modular check for the API
  const checkIpWithApi = async (selectedIp) => {
    if (apiCheckEnabled) {
      // Only call the API if the environment variable is true
      const { data: r2 } = await axiosInstance.get(
        `https://api.incolumitas.com/?q=${selectedIp}`
      );

      let isGood = true;
      if (
        r2?.is_datacenter ||
        r2?.is_tor ||
        r2?.is_proxy ||
        r2?.is_vpn ||
        r2?.is_abuser
      ) {
        isGood = false;
        console.log("Bad user IP detected: ", selectedIp);
      }

      return isGood; // Return the result based on the API check
    } else {
      console.log("API check is disabled, proceeding without it.");
      return true; // If the check is disabled, consider the IP as good
    }
  };

  // Main logic for handling DNS records
  const handleDnsRecord = async (selectedIp, domain_name, zone_name) => {
    const connected = await checkConnection(selectedIp, app_port);

    // Use the modular API check here
    const isGood = await checkIpWithApi(selectedIp);

    const record = records.find(
      (r) => r.content === selectedIp && r.name === domain_name
    );

    if (connected && isGood) {
      if (!record) {
        console.log(
          `Creating new record for IP: ${selectedIp} in VARO DNS Server`
        );
        await api.post("", {
          action: "addRecord",
          zone: zone_name,
          type: "A",
          name: domain_name,
          content: selectedIp,
        });
      } else {
        console.log(
          `Record for IP: ${selectedIp} already exists in VARO DNS Server`
        );
      }
    } else if ((!connected || !isGood) && record) {
      console.log(`Unsuccessful response from IP: ${selectedIp}`);
      await api
        .post("", {
          action: "deleteRecord",
          zone: zone_name,
          record: record.uuid,
        })
        .catch((e) => console.log(e?.message ?? e));
      console.log(`IP: ${selectedIp} deleted`);
    }
  };

  await handleDnsRecord(selectedIp, domain_name, zone_name);
}

async function getZoneAndRecords(domain_name, port, app_name) {
  let zone = "";
  let records = [];
  const ICANN_TLDS = await getTlds();
  console.log(
    `Processing DNS zone for app: ${app_name}, domain: ${domain_name}`
  );

  try {
    // Function to get the root domain based on ICANN status
    function getRootDomain(domain) {
      const parts = domain.split(".");
      const tld = parts[parts.length - 1];

      // Check if the TLD is in ICANN_TLDS
      if (ICANN_TLDS.includes(tld)) {
        // For ICANN TLDs, we need the last two parts (domain.tld)
        if (parts.length < 2) return domain;
        return parts.slice(-2).join(".");
      } else {
        // For non-ICANN TLDs, we just need the TLD
        return tld;
      }
    }

    let rootDomain = getRootDomain(domain_name);
    console.log(`Determined root domain: ${rootDomain} for ${domain_name}`);

    // Fetch all zones
    const { data } = await api.post("", {
      action: "getZones",
    });

    // Check if a zone for the root domain exists
    const existingZone = data.data.find((z) => z.name === rootDomain);

    if (existingZone) {
      zone = existingZone.id;
      console.log(`Zone for root domain ${rootDomain} already exists: ${zone}`);
    } else {
      // Create new zone using the root domain
      const { data: newZoneData } = await api.post("", {
        action: "createZone",
        domain: rootDomain,
      });
      zone = newZoneData.data.zone;
      console.log(`Zone created for root domain ${rootDomain}: ${zone}`);
    }

    // Fetch records for the zone
    const { data: recordsData } = await api.post("", {
      action: "getRecords",
      zone: zone,
    });

    // Check records and verify connectivity
    records = [];
    for (const record of recordsData.data ?? []) {
      try {
        await checkConnection(record.content, port);
        records.push(record);
      } catch (error) {
        console.log(
          `[App: ${app_name}] Connection check failed for IP ${record.content}`
        );
        console.log(
          `[App: ${app_name}] Deleting IP ${record.content} from DNS zone ${rootDomain}`
        );
        await api
          .post("", {
            action: "deleteRecord",
            zone: zone,
            record: record.uuid,
          })
          .catch((e) =>
            console.log(
              `[App: ${app_name}] Error deleting record: ${e?.message ?? e}`
            )
          );
      }
    }

    return { records, zone };
  } catch (error) {
    console.log(
      `[App: ${app_name}] Unable to get or create zone or get DNS records for ${domain_name}: ${
        error?.message ?? error
      }`
    );
    return { records, zone };
  }
}

// Uncomment to test checkIP functionality
// checkIP();
module.exports = {
  checkIP,
};
