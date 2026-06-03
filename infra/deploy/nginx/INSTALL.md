# Nginx Setup (Stage + Prod on 80/443 only)

## 1) Install nginx + certbot
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2) Prepare config from template
```bash
cp deploy/nginx/sofortbot.conf.template /tmp/sofortbot.conf
```

Replace placeholders in `/tmp/sofortbot.conf`:
- `__DEV_DOMAIN__`
- `__STAGE_DOMAIN__`
- `__PROD_DOMAIN__`

For SofortBot:
- `__DEV_DOMAIN__` -> `devwarehub.automatonsoft.de`
- `__STAGE_DOMAIN__` -> `stagewarehub.automatonsoft.de`
- `__PROD_DOMAIN__` -> `warehub.automatonsoft.de`

Example replacement:
```bash
sed -i 's/__DEV_DOMAIN__/devwarehub.automatonsoft.de/g' /tmp/sofortbot.conf
sed -i 's/__STAGE_DOMAIN__/stagewarehub.automatonsoft.de/g' /tmp/sofortbot.conf
sed -i 's/__PROD_DOMAIN__/warehub.automatonsoft.de/g' /tmp/sofortbot.conf
```

Then install:
```bash
sudo cp /tmp/sofortbot.conf /etc/nginx/conf.d/sofortbot.conf
sudo nginx -t
sudo systemctl reload nginx

# Optional APK static files (for dashboard "Download App" button)
sudo mkdir -p /var/www/warehub-downloads
# Put files:
# /var/www/warehub-downloads/warehubstage.apk
# /var/www/warehub-downloads/warehub.apk
```

## 3) Issue TLS certificates
Run for all 3 domains:
```bash
sudo certbot --nginx -d <domain>
```

SofortBot example:
```bash
sudo certbot --nginx -d devwarehub.automatonsoft.de
sudo certbot --nginx -d stagewarehub.automatonsoft.de
sudo certbot --nginx -d warehub.automatonsoft.de
```

## 4) Lock down firewall (public only 80/443)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8931/tcp
sudo ufw deny 8932/tcp
sudo ufw deny 8933/tcp
sudo ufw deny 8941/tcp
sudo ufw deny 8942/tcp
sudo ufw deny 8943/tcp
sudo ufw deny 8951/tcp
sudo ufw deny 8952/tcp
sudo ufw deny 8953/tcp
sudo ufw reload
sudo ufw status
```

## 5) Final checks
```bash
curl -I https://devwarehub.automatonsoft.de
curl https://devwarehub.automatonsoft.de/api/v1/meta
curl -I https://stagewarehub.automatonsoft.de
curl https://stagewarehub.automatonsoft.de/api/v1/meta
curl -I https://warehub.automatonsoft.de
curl https://warehub.automatonsoft.de/api/v1/meta
```

## Notes
- Current template routes:
  - `dev` -> `8931/8932`
  - `stage` -> `8941/8942`
  - `prod` -> `8951/8952`
