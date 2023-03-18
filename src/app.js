const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");

const {
  findMostCommonResponse,
  getWorkingNodes,
  checkConnection,
  api,
} = require("./utils");

async function checkIP({ app_name, app_port, domain_name }) {
  try {
    // Select 5 random URLs
    const randomFluxNodes = await getWorkingNodes();

    const randomUrls = randomFluxNodes.map(
      (ip) => `http://${ip}:16127/apps/location/${app_name}`
    );

    const requests = randomUrls.map((url) =>
      axios.get(url).catch((error) => {
        console.log(`Error while making request to ${url}: ${error}`);
      })
    );

    const responses = await axios.all(requests).catch((error) => {
      console.log(`Error while making concurrent requests: ${error}`);
    });

    let responseData = [];
    for (let i = 0; i < responses.length; i++) {
      if (responses[i] && responses[i].data) {
        const data = responses[i].data.data;
        responseData.push(data.map((item) => item.ip));
      }
    }

    // Find the most common IP
    const commonIps = findMostCommonResponse(responseData).map((ip) => {
      if (ip.includes(":")) {
        return ip.split(":")[0];
      }
      return ip;
    });

    const { records, zone } = await getZoneAndRecords(domain_name, app_port);
    console.log("app_name: ", app_name);
    console.log("app_port: ", app_port);
    console.log("flux Consensus Ip list for app: ", commonIps);
    console.log("dns server returned records: ", records);

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
  // Check if the selected IP returns success response
  const connected = await checkConnection(selectedIp, app_port);
  const { data: r2 } = await axios.get(
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
    console.log("bad user ip detected: ", selectedIp);
  }

  const record = records.find(
    (r) => r.content === selectedIp && r.name === domain_name
  );
  if (connected && isGood) {
    if (!record) {
      console.log(
        `Creating new record for IP: ${selectedIp} in VARO DNS Server`
      );
      // Create new DNS record
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
      .catch((e) => console.log(e));
    console.log(`IP: ${selectedIp} deleted `);
  }
}

async function getZoneAndRecords(name, port) {
  let zone = "";
  let records = [];
  console.log("processing dns zone for name: ", name);
  try {
    const { data } = await api.post("", {
      action: "getZones",
    });
    let domain = name;
    if (domain.includes(".")) {
      const split = domain.split(".");
      domain = `${split[split.length - 2]}.${split[split.length - 1]}`;
    }
    console.log("data ", data);
    const z = data.data.find((z) => z.name === domain);
    if (!z) {
      const { data } = await api.post("", {
        action: "createZone",
        domain: domain,
      });

      zone = data.data.zone;
      console.log(`zone created ${zone} NAME: ${domain}`);
    } else {
      console.log(`zone exist ${z.name}:${z.id}`);
      zone = z.id;
    }

    const { data: recordsData } = await api.post("", {
      action: "getRecords",
      zone: zone,
    });
    records = [];
    for (const record of recordsData.data ?? []) {
      try {
        await checkConnection(record.content, port);
        records.push(record);
      } catch (error) {
        console.log(error);
        console.log("deleting ip from dns server ", record.content);
        await api
          .post("", {
            action: "deleteRecord",
            zone: zone,
            record: record.uuid,
          })
          .catch((e) => console.log(e?.message));
      }
    }
    return { records, zone };
  } catch (error) {
    console.log(
      "Unable to get or create zone or get DNS records: ",
      error?.message
    );
    return { records, zone };
  }
}

// checkIP();
module.exports = {
  checkIP,
};
