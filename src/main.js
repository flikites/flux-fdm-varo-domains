const dotenv = require("dotenv");
dotenv.config();
const cron = require("node-cron");
const { checkIP } = require("./app");

const APP_NAME = process.env.APP_NAME?.trim();
const APP_PORT = process.env.APP_PORT.trim();
const DOMAINS_NAME = process.env.DOMAIN_NAME?.split(",");

async function main() {
  checkIP({
    app_name: APP_NAME,
    app_port: APP_PORT,
    domain_names: DOMAINS_NAME,
  });
}

if (require.main === module) {
  main();
  cron.schedule("*/1 * * * *", () => {
    main();
  });
}
