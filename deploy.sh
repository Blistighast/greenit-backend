#!/bin/bash

echo What should the version be?
read VERSION

docker build -t brianguterl/greenit:$VERSION .
docker push brianguterl/greenit:$VERSION
ssh root@147.182.170.85 "docker pull brianguterl/greenit:$VERSION && docker tag brianguterl/greenit:$VERSION dokku/api:1 && dokku tags:deploy api 1"
