#!/bin/sh
set -eu

trusted_proxy_ip="$(getent ahostsv4 host.docker.internal | awk 'NR == 1 { print $1 }')"
docker_gateway_ip="$(ip route | awk '/default/ { print $3; exit }')"

cat > /etc/nginx/conf.d/trusted-proxy.conf <<EOF
set_real_ip_from ${trusted_proxy_ip};
set_real_ip_from ${docker_gateway_ip};
set_real_ip_from 127.0.0.1;
set_real_ip_from ::1;
real_ip_header X-Real-IP;
real_ip_recursive on;
EOF
