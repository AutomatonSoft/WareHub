#!/bin/sh
set -eu

mkdir -p \
  /tmp/nginx/client-body \
  /tmp/nginx/proxy \
  /tmp/nginx/fastcgi \
  /tmp/nginx/uwsgi \
  /tmp/nginx/scgi \
  /var/cache/nginx
