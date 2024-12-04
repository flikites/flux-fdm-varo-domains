## Docker:

### Build Image

`git clone --branch wordpress https://github.com/flikites/flux-fdm-varo-domains.git`

`cd flux-fdm-varo-domains`

`docker build -t whatever/you:want -f Dockerfile.alpine .`

### Run Container

`docker run --name flux-fdm-varo-wordpress --env-file=.env wirewrex/flux-dns-fdm:wordpress`

You can side load the .env file to the `/tmp` folder, it will attempt to load them before starting the app. 

Useful for running on Flux and using the Interactive terminals "Volume Browser" to upload the .env file. 


## Envirornment Variables

`APP_NAME` must be the name of a wordpress app that is running on Flux that uses the `operator` component alongside the `mysql` component.

`APP_PORT` is going to be the `Port` on your Flux deployment that corresponds to the `Container Port` of `8008` on the `operator` component.

`DNS_SERVER_API_KEY` can be obtained from the `Settings` section while logged into `https://varo.domains` or `https://varo` on [Handshake](https://handshake.org)

`DNS_SERVER_ADDRESS` can be `https://varo.domains/api` or `https://varo/api` or `https://domains.hns.au/api` or [self host your own](https://github.com/Nathanwoodburn/HNS-server/tree/main/varo)

```
DNS_SERVER_API_KEY=secret
DNS_SERVER_ADDRESS=https://varo.domains/api
APP_NAME=wordpress1726249800818
APP_PORT=31502
DOMAIN_NAME=wordpress.fluxos
```


## Run On Flux

Navigate to `https:/home.runonflux.io/apps/registerapp` and click the import button.

Paste the below and click import. Change the app name and follow prompts to sign and pay.

```
{"name":"changeme","compose":[{"name":"ddns","description":"","repotag":"wirewrex/flux-dns-fdm:wordpress","ports":[],"domains":[],"environmentParameters":[],"commands":[],"containerPorts":[],"containerData":"g:/tmp","cpu":0.1,"ram":100,"hdd":1,"tiered":false,"secrets":"","repoauth":""}],"contacts":[],"description":"ENVs (you can sideload using interactive terminal); \nDNS_SERVER_API_KEY=secret\nDNS_SERVER_ADDRESS=https://varo.domains/api\nAPP_NAME=wordpress1726249800818\nAPP_PORT=31502\nDOMAIN_NAME=icann.handshake","expire":132000,"geolocation":["acNA"],"hash":"ef4f3acd96e10724fa19841a5c1cdf666f1e378599034d806b962a5a1b3786b0","height":1787714,"instances":3,"nodes":[],"owner":"14QJfVTFQdb34kw9MiAfW4apXgrcyULoEB","staticip":false,"version":7}
```
