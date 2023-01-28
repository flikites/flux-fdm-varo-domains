FROM node:latest

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

RUN touch cron.log

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install --only=production


CMD [ "npm", "run", "start" ]
