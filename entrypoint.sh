#!/bin/sh

# Check for environment variables and perform any actions if needed

echo "Checking environment variables..."

# Load the .env file
if [ -f /tmp/.env ]; then
    export $(grep -v '^#' /tmp/.env | xargs)
else
    echo ".env file not found"
fi

if [ "$API_CHECK_ENABLED" = "true" ]; then
  echo "API check is enabled"
else
  echo "API check is disabled"
fi

if [ -n "$DNS_SERVER" ]; then
  echo "nameserver $DNS_SERVER" | tee /etc/resolv.conf > /dev/null
fi

# Default action: Start the Node.js app using npm
echo "Starting the app with command: npm run start"
exec npm run start
