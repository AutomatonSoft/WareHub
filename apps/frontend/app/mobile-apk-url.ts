function isStageEnv(env: string): boolean {
  const normalized = env.trim().toLowerCase();
  return normalized === "stage" || normalized === "staging";
}

function isProdEnv(env: string): boolean {
  const normalized = env.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

export function resolveMobileApkUrl(
  appEnv: string,
  stageUrl: string,
  prodUrl: string,
  fallbackUrl: string
): string {
  if (isStageEnv(appEnv) && stageUrl.trim().length > 0) {
    return stageUrl;
  }

  if (isProdEnv(appEnv) && prodUrl.trim().length > 0) {
    return prodUrl;
  }

  if (fallbackUrl.trim().length > 0) {
    return fallbackUrl;
  }

  if (isStageEnv(appEnv)) {
    return "/mobile/sofortbot-stage.apk";
  }

  if (isProdEnv(appEnv)) {
    return "/mobile/sofortbot.apk";
  }

  return "/mobile/sofortbot.apk";
}

export function resolveMobileApkUrlFromEnv(): string {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "";
  const stageUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL_STAGE ?? "";
  const prodUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL_PROD ?? "";
  const fallbackUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "";

  return resolveMobileApkUrl(appEnv, stageUrl, prodUrl, fallbackUrl);
}
