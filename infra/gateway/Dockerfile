FROM nginxinc/nginx-unprivileged:1.28-alpine

USER root

RUN mkdir -p /tmp/nginx/client-body \
    /tmp/nginx/proxy \
    /tmp/nginx/fastcgi \
    /tmp/nginx/uwsgi \
    /tmp/nginx/scgi \
    /var/cache/nginx \
  && rm -f /etc/nginx/conf.d/default.conf \
  && rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
  && chown -R 101:101 /tmp/nginx /var/cache/nginx /etc/nginx \
  && chmod -R 755 /tmp/nginx /var/cache/nginx \
  && find /etc/nginx -type d -exec chmod 755 {} \; \
  && find /etc/nginx -type f -exec chmod 444 {} \;

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/05-runtime-dirs.sh /docker-entrypoint.d/05-runtime-dirs.sh
COPY docker-entrypoint.d/06-trusted-proxy.sh /docker-entrypoint.d/06-trusted-proxy.sh

RUN chown -R 101:101 /etc/nginx /var/cache/nginx /tmp/nginx \
  && chmod 444 /etc/nginx/nginx.conf /etc/nginx/templates/default.conf.template \
  && chmod 555 /docker-entrypoint.d/05-runtime-dirs.sh \
  && chmod 555 /docker-entrypoint.d/06-trusted-proxy.sh

USER 101

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 CMD wget -q -O - http://127.0.0.1:8080/gateway/healthz || exit 1

STOPSIGNAL SIGQUIT
