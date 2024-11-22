const fs = require("fs").promises;
const net = require("net");
const axios = require("axios");

const api = axios.create({
  baseURL: process.env.DNS_SERVER_ADDRESS ?? "https://varo.domains/api",
  headers: {
    Authorization: `Bearer ${process.env.DNS_SERVER_API_KEY}`,
  },
});

async function getFluxNodes() {
  try {
    const data = await fs.readFile(__dirname + "/ips.txt", "utf8");
    const lines = data.split("\n");
    return lines.map((ip) => ip.trim());
  } catch (err) {
    console.log(err);
    return [];
  }
}

async function getTlds() {
  try {
    const data = await fs.readFile(__dirname + "/tlds.txt", "utf8");
    const lines = data.split("\n");
    return lines.map((tld) => tld.trim().toLowerCase());
  } catch (err) {
    console.log(err);
    return [];
  }
}

function findMostCommonResponse(arr) {
  let subArrCount = {};
  let maxCount = 0;
  let mostCommon;

  for (let i = 0; i < arr.length; i++) {
    let subArr = JSON.stringify(arr[i]);
    if (!subArrCount[subArr]) {
      subArrCount[subArr] = 1;
    } else {
      subArrCount[subArr]++;
    }
    if (subArrCount[subArr] > maxCount) {
      maxCount = subArrCount[subArr];
      mostCommon = JSON.parse(subArr);
    }
  }
  return mostCommon;
}

async function checkConnection(host, port, timeout = 3000) {
  console.log(`Started TCP health check for ${host}:${port}`);

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let isConnectionClosed = false;

    // Helper function to clean up connection
    const cleanup = () => {
      if (!isConnectionClosed) {
        isConnectionClosed = true;
        client.removeAllListeners(); // Remove all event listeners
        client.destroy(); // Ensure socket is destroyed
      }
    };

    // Set connection timeout
    client.setTimeout(timeout);

    // Handle successful connection
    client.connect(port, host, () => {
      console.log(`[TCP success] ${host}:${port} is reachable`);
      cleanup();
      resolve(true);
    });

    // Handle connection error
    client.on("error", (error) => {
      console.log(`[TCP error] ${host}:${port} is unreachable:`, error.message);
      cleanup();
      reject(new Error(`TCP connection failed: ${error.message}`));
    });

    // Handle timeout
    client.on("timeout", () => {
      console.log(
        `[TCP timeout] ${host}:${port} connection timed out after ${timeout}ms`
      );
      cleanup();
      reject(new Error(`TCP connection timed out after ${timeout}ms`));
    });

    // Handle unexpected closing
    client.on("close", () => {
      if (!isConnectionClosed) {
        console.log(
          `[TCP closed] ${host}:${port} connection closed unexpectedly`
        );
        cleanup();
        reject(new Error("Connection closed unexpectedly"));
      }
    });
  });
}

async function getWorkingNodes() {
  const fluxNodes = await getFluxNodes();
  const activeIps = [];
  console.log("finding healthy flux nodes");
  for (const ip of fluxNodes) {
    try {
      if (await checkConnection(ip, 16127)) {
        activeIps.push(ip);
        if (activeIps.length >= 5) {
          return activeIps;
        }
      } else {
        console.log(`avoiding bad flux node ${ip} tcp check failed`);
      }
    } catch (error) {
      console.log(`avoiding bad flux node ${ip} err: ${error?.message}`);
    }
  }
  return activeIps;
}

module.exports = {
  findMostCommonResponse,
  checkConnection,
  getWorkingNodes,
  getTlds,
  api,
};
