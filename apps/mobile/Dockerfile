# syntax=docker/dockerfile:1.7

FROM ghcr.io/cirruslabs/flutter:3.41.1 AS dev
WORKDIR /app
COPY . .
RUN flutter pub get

EXPOSE 8081
CMD ["flutter", "run", "-d", "web-server", "--web-port", "8081", "--web-hostname", "0.0.0.0"]

FROM dev AS builder
RUN flutter test
RUN flutter build web --release

FROM nginx:1.27-alpine AS stage
COPY --from=builder /app/build/web /usr/share/nginx/html

FROM nginx:1.27-alpine AS prod
COPY --from=builder /app/build/web /usr/share/nginx/html
