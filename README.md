# flux-dns-fdm

DNS based Flux Domain Manager

Currently only has support for [Technitium DNS](https://github.com/TechnitiumSoftware/DnsServer)
https://github.com/TechnitiumSoftware/DnsServer

You can easily install your own self hosted DNS server using multiple methods, including docker, with this [link](https://blog.technitium.com/2017/11/running-dns-server-on-ubuntu-linux.html):
https://blog.technitium.com/2017/11/running-dns-server-on-ubuntu-linux.html

To generate your API Key use the drop down in the top right hand corner of the webadmin UI titled "Create API Token"

or follow this link for alternative instructions: https://github.com/TechnitiumSoftware/DnsServer/blob/master/APIDOCS.md#create-api-token



To run this app in Ubuntu/Debain/Linux follow the below instructions:

create a .env file or set value to your environment according to `example_env`

Install dependencis using the command `npm install` or `yarn install`

To run and start the application:
`npm run start` or `yarn start`

to run this as a docker container:

build image
`docker build -t yourtag .`

run container
`docker run --env-file=.env flux-dns-fdm`
or `docker run --env ENV_NAME=VALUE --env ENV_NAME=VALUE flux-dns-fdm`


## Envirornment Variables 

```DNS_SERVER_ADDRESS=http://127.0.0.1:5380
DNS_SERVER_TOKEN_NAME=your_token_name
DNS_SERVER_TOKEN=your_token
DNS_ZONE_NAME=fluxvpn
DOMAIN_NAME=try.fluxvpn
APP_NAME=radiusraid
APP_PORT=36025
