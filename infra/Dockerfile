# syntax=docker/dockerfile:1.7

FROM alpine:3.20 AS dev
RUN apk add --no-cache bash curl jq docker-cli
WORKDIR /workspace
CMD ["sh", "-c", "echo 'Infra dev tools container'; tail -f /dev/null"]

FROM alpine:3.20 AS stage
RUN apk add --no-cache bash curl jq docker-cli
WORKDIR /workspace
ENV APP_ENV=stage
CMD ["sh", "-c", "echo 'Infra stage tools container'; tail -f /dev/null"]

FROM alpine:3.20 AS prod
RUN apk add --no-cache bash curl jq docker-cli
WORKDIR /workspace
ENV APP_ENV=prod
CMD ["sh", "-c", "echo 'Infra prod tools container'; tail -f /dev/null"]