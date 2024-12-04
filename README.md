## Docker:

### Build Image

`git clone --branch wordpress https://github.com/flikites/flux-fdm-varo-domains.git`

`cd flux-fdm-varo-domains`

`docker build -t whatever/you:want -f Dockerfile.alpine .`

### Run Container

`docker run --name flux-fdm-varo-wordpress --env-file=.env whatever/you:want`

You can side load the .env file to the `/tmp` folder, it will attempt to load them before starting the app. 

Useful for running on Flux and using the Interactive terminals "Volume Browser" to upload the .env file. 


## Envirornment Variables

`APP_NAME` must be the name of a wordpress app that is running on Flux that uses the `operator` component alongside the `mysql` component.

`APP_PORT` is going to be the `Port` on your Flux deployment that corresponds to the `Container Port` of `8008` on the `operator component.

`DNS_SERVER_API_KEY` can be obtained from the `Settings` section while logged into `https://varo.domains` or `https://varo` on [Handshake](https://handshake.org)

`DNS_SERVER_ADDRESS` can be `https://varo.domains/api` or `https://varo/api` or `https://domains.hns.au/api` or `[self host your own](https://github.com/Nathanwoodburn/HNS-server/tree/main/varo)

```DNS_SERVER_API_KEY=secret
DNS_SERVER_ADDRESS=https://varo.domains/api
APP_NAME=testywp
APP_PORT=32594
DOMAIN_NAME=wordpress.fluxos
```
