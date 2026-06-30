FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json* ./
RUN if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; else echo 'No package.json yet'; fi

FROM node:24-alpine AS dev
WORKDIR /app
COPY --from=deps /app /app
COPY . .
EXPOSE 8931
CMD ["sh", "-c", "if [ -f package.json ]; then npm run dev -- --port 8931; else echo 'Frontend scaffold not initialized.' && tail -f /dev/null; fi"]

FROM node:24-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_ANDROID_APK_URL=
ARG NEXT_PUBLIC_ANDROID_APK_URL_STAGE=
ARG NEXT_PUBLIC_ANDROID_APK_URL_PROD=
ARG NEXT_PUBLIC_ANDROID_APP_NAME=warehub
ENV NEXT_PUBLIC_ANDROID_APK_URL=$NEXT_PUBLIC_ANDROID_APK_URL
ENV NEXT_PUBLIC_ANDROID_APK_URL_STAGE=$NEXT_PUBLIC_ANDROID_APK_URL_STAGE
ENV NEXT_PUBLIC_ANDROID_APK_URL_PROD=$NEXT_PUBLIC_ANDROID_APK_URL_PROD
ENV NEXT_PUBLIC_ANDROID_APP_NAME=$NEXT_PUBLIC_ANDROID_APP_NAME
COPY --from=deps /app /app
COPY . .
RUN if [ -f package.json ]; then npm run build; else echo 'No package.json, skip build'; fi

FROM node:24-alpine AS stage
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=stage
ENV PORT=8931
ENV HOSTNAME=0.0.0.0
# Next.js standalone output: minimal traced server + static assets only.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 8931
CMD ["node", "server.js"]

FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=prod
ENV PORT=8931
ENV HOSTNAME=0.0.0.0
# Next.js standalone output: minimal traced server + static assets only.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 8931
CMD ["node", "server.js"]
