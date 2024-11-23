#!/bin/sh

# Check for environment variables and perform any actions if needed

echo "Checking environment variables..."

# Load the .env file
if [ -f "${DOTENV_PATH:-/tmp/.env}" ]; then
    # Export environment variables from the .env file
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ ! "$key" =~ ^# && -n "$key" ]]; then
            export "$key=$value"
        fi
    done < "${DOTENV_PATH:-/tmp/.env}"
else
    echo ".env file not found"
fi

if [ -n "$DNS_SERVER" ]; then
  echo "nameserver $DNS_SERVER" | tee /etc/resolv.conf > /dev/null
fi

# Default action: Start the Node.js app using npm
echo "Starting the app with command: npm run start"
exec npm run start
