const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");

const {
  findMostCommonResponse,
  getWorkingNodes,
  checkConnection,
  api,
} = require("./utils");

async function checkIP({ app_name, app_port, domain_names }) {
  try {
    console.log(domain_names);
    const randomUrls = await getRandomUrls(app_name);
    const responses = await makeConcurrentRequests(randomUrls);
    const responseData = getResponseData(responses);
    const commonIps = findCommonIps(responseData);
    console.log("commonIps ", commonIps);
    const healthyIps = await findHealthyIps(commonIps, app_port);
    console.log("healthyIps ", healthyIps);
    if (healthyIps?.length) {
      const { records, zone } = await getZoneAndRecords(
        app_name,
        app_port,
        healthyIps
      );
      console.log("records ", records);
      await processDomainNames(domain_names, healthyIps, records, zone);
    } else {
      console.log("there is no healthy ips so application is quiting.");
    }
  } catch (error) {
    console.error(error?.message ?? error);
  }
}

async function getRandomUrls(app_name) {
  const randomFluxNodes = await getWorkingNodes();
  return randomFluxNodes.map(
    (ip) => `http://${ip}:16127/apps/location/${app_name}`
  );
}

async function makeConcurrentRequests(randomUrls) {
  const requests = randomUrls.map((url) =>
    axios.get(url).catch((error) => {
      console.log(`Error while making request to ${url}: ${error}`);
    })
  );
  return await axios.all(requests).catch((error) => {
    console.log(`Error while making concurrent requests: ${error}`);
  });
}

function getResponseData(responses) {
  let responseData = [];
  for (let i = 0; i < responses.length; i++) {
    if (responses[i] && responses[i].data) {
      const data = responses[i].data.data;
      responseData.push(data.map((item) => item.ip));
    }
  }
  return responseData;
}

function findCommonIps(responseData) {
  return findMostCommonResponse(responseData).map((ip) => {
    if (ip.includes(":")) {
      return ip.split(":")[0];
    }
    return ip;
  });
}

async function findHealthyIps(commonIps, app_port) {
  const healthyIps = [];
  for (const ip of commonIps) {
    try {
      await checkConnection(ip, app_port);
      healthyIps.push(ip);
    } catch (error) {
      console.log("flux returned a bad ip we are excluding from commonIps", ip);
    }
  }
  return healthyIps;
}

async function processDomainNames(domain_names, healthyIps, records, zone) {
  for (const [index, domainName] of domain_names.entries()) {
    const ip = index < healthyIps.length ? healthyIps[index] : healthyIps[0];
    try {
      await createOrDeleteRecord(ip, records, domainName, zone);
    } catch (error) {
      console.log(error?.message ?? error);
    }
  }
}

async function createOrDeleteRecord(
  selectedIp,
  records = [],
  domain_name,
  zone_name
) {
  const record = records.find((r) => r.name === domain_name);

  if (!record && selectedIp && domain_name) {
    console.log(
      `Creating new record for IP: ${selectedIp} for name ${domain_name} in VARO DNS Server`
    );
    // Create new DNS record
    const { data } = await api.post("", {
      action: "addRecord",
      zone: zone_name,
      type: "A",
      name: domain_name,
      content: selectedIp,
    });
    console.log("d ", data);
  } else {
    console.log(
      `Record for IP: ${selectedIp} already exists in VARO DNS Server`
    );
  }
}

async function getZoneAndRecords(name, port, commonIps) {
  let zone = "";
  let records = [];
  console.log("processing dns zone for name: ", name);

  try {
    const { data } = await api.post("", { action: "getZones" });
    // const domain = getDomainFromName(name);
    const existingZone = data.data.find((z) => z.name === name);

    if (existingZone) {
      console.log(`zone exists ${existingZone.name}:${existingZone.id}`);
      zone = existingZone.id;
    } else {
      const { data: createdZone } = await api.post("", {
        action: "createZone",
        name,
      });
      zone = createdZone.data.zone;
      console.log(`zone created ${zone} NAME: ${name}`);
    }

    const { data: recordsData } = await api.post("", {
      action: "getRecords",
      zone,
    });

    for (const record of recordsData.data ?? []) {
      try {
        await checkConnection(record.content, port);
        records.push(record);
      } catch (error) {
        console.log(
          `detected a bad record with name: ${record.name} and ip ${record.content}`
        );

        const newIp =
          findHealthyNewIp(commonIps, data.result) ?? getRandomIp(commonIps);
        console.log(
          `replacing bad ip: ${record.content} with new ip:${newIp} for domain:${record.name}`
        );

        await api.post("", {
          action: "updateRecord",
          zone,
          record: record.id,
          column: "content",
          value: newIp,
        });

        record.content = newIp;
        records.push(record);
      }
    }
  } catch (error) {
    console.log(
      "Unable to get or create zone or get DNS records: ",
      error?.message
    );
  }
  return { records, zone };
}

// function getDomainFromName(name) {
//   if (!name.includes(".")) return name;
//   const split = name.split(".");
//   return `${split[split.length - 2]}.${split[split.length - 1]}`;
// }

function findHealthyNewIp(commonIps, records) {
  return commonIps.find((ip) => !records.find((r) => r.content === ip));
}

function getRandomIp(commonIps) {
  const randomIndex = Math.floor(Math.random() * commonIps.length);
  return commonIps[randomIndex];
}

// checkIP();
module.exports = {
  checkIP,
};
