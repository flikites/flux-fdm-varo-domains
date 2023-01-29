const dotenv = require("dotenv");
dotenv.config();
const { Worker } = require("worker_threads");
const cron = require("node-cron");
const axios = require("axios");
const { api } = require("./utils");

const APPS_NAME = process.env.APP_NAME?.split(",");
const APPS_PORT = process.env.APP_PORT?.split(",");
const DNS_ZONES_NAME = process.env.DNS_ZONE_NAME?.split(",");
const DOMAINS_NAME = process.env.DOMAIN_NAME?.split(",");

async function main() {
  let workers = [];
  const workingIpsByZone = {};

  await Promise.all(
    DNS_ZONES_NAME.map((zone) => {
      return getHealthyIp(zone, APPS_PORT).then((ips) => {
        workingIpsByZone[zone] = ips;
      });
    })
  );

  for (let i = 0; i < APPS_NAME.length; i++) {
    console.log("Worker: ", i + 1);
    const worker = new Worker(__dirname + "/app.js", {
      workerData: {
        app_name: APPS_NAME[i],
        app_port: APPS_PORT[i],
        zone_name: DNS_ZONES_NAME[i],
        domain_name: DOMAINS_NAME[i],
        working_addresses: workingIpsByZone[DNS_ZONES_NAME[i]],
      },
    });
    worker.on("message", (message) => {
      console.log(message);
    });
    worker.on("exit", (code) => {
      if (code !== 0)
        console.error(new Error(`Worker stopped with exit code ${code}`));
    });
    worker.on("error", (err) => {
      console.log("worker error ", err?.message ?? err);
    });
    workers.push(worker);
  }
}

async function getHealthyIp(zone, ports) {
  console.log("==============zone============");
  console.log(zone);
  console.log("=============zone=============");

  const workingIPs = [];
  const { data } = await api.post("", {
    action: "getRecords",
    zone: zone,
  });
  const records = data.data.filter((item) => item.type === "A");
  for (const record of records) {
    let isHealthy = false;
    for (const port of ports) {
      try {
        console.log(`checking http://${record.content}:${port}`);
        const { status } = await axios.get(`http://${record.content}:${port}`);
        if (status === 200) {
          isHealthy = true;
          workingIPs.push(record.content);
          console.info(`looks healthy: http://${record.content}:${port}`);
          break;
        }
      } catch (error) {
        console.log(`H->Error connecting to ${record.content}:${port}`);
      }
    }

    if (!isHealthy) {
      console.log(
        `Health check failed IP:${record.content} deleting from dns server`
      );
      await api
        .post("", {
          action: "deleteRecord",
          zone: zone,
          record: record.uuid,
        })
        .catch(console.log);
    }
  }
  return workingIPs;
}

if (require.main === module) {
  main();
  cron.schedule("*/15 * * * *", () => {
    main();
  });
}
