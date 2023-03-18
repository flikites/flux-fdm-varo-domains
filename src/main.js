const dotenv = require("dotenv");
dotenv.config();
const cron = require("node-cron");
const { checkIP } = require("./app");

const APPS_NAME = process.env.APP_NAME?.split(",");
const APPS_PORT = process.env.APP_PORT?.split(",");
const DOMAINS_NAME = process.env.DOMAIN_NAME?.split(",");

async function main() {
  let workers = [];
  for (let i = 0; i < APPS_NAME.length; i++) {
    workers.push(
      checkIP({
        app_name: APPS_NAME[i],
        app_port: APPS_PORT[i],
        domain_name: DOMAINS_NAME[i],
      })
    );
  }
  await Promise.all(workers);
}

if (require.main === module) {
  main();
  cron.schedule("*/15 * * * *", () => {
    main();
  });
}
