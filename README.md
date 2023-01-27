# flux-dns-fdm

DNS based Flux Domain Manager

Currently only has support for [Technitium DNS](https://github.com/TechnitiumSoftware/DnsServer)

to run this app follow below instruction

create a .env file or set value to your environment according to `example_env`

install depedencis `npm install` or `yarn install`

to run
`npm run start` or `yarn start`

to run as a docker container

build image
`docker build -t yourtag .`

run container
`docker run --env-file=.env flux-fdm`
or `docker run --env ENV_NAME=VALUE --env ENV_NAME=VALUE flux-fdm`
