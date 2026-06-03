# syntax=docker/dockerfile:1.7

FROM rust:1.88-slim AS dev
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY migrations migrations
COPY src src
EXPOSE 8932
CMD ["cargo", "run"]

FROM rust:1.88-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY migrations migrations
COPY src src
RUN cargo build --release

FROM debian:bookworm-slim AS stage
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser
WORKDIR /home/appuser
ENV APP_ENV=stage
COPY --from=builder /app/target/release/sofortbot-backend /usr/local/bin/sofortbot-backend
EXPOSE 8932
USER appuser
CMD ["/usr/local/bin/sofortbot-backend"]

FROM debian:bookworm-slim AS prod
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser
WORKDIR /home/appuser
ENV APP_ENV=prod
COPY --from=builder /app/target/release/sofortbot-backend /usr/local/bin/sofortbot-backend
EXPOSE 8932
USER appuser
CMD ["/usr/local/bin/sofortbot-backend"]
