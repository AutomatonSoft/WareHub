function isStageEnv(env: string): boolean {
  const normalized = env.trim().toLowerCase();
  return normalized === "stage" || normalized === "staging";
}

function isProdEnv(env: string): boolean {
  const normalized = env.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

export const MOBILE_APK_DOWNLOAD_PATH = "/mobile/download";

function isConfiguredApkUrl(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("TODO_") || normalized.includes("__SET_")) {
    return false;
  }

  return normalized.startsWith("/") || normalized.startsWith("https://") || normalized.startsWith("http://");
}

export function resolveMobileApkUrl(
  appEnv: string,
  stageUrl: string,
  prodUrl: string,
  fallbackUrl: string
): string {
  if (isStageEnv(appEnv) && isConfiguredApkUrl(stageUrl)) {
    return stageUrl;
  }

  if (isProdEnv(appEnv) && isConfiguredApkUrl(prodUrl)) {
    return prodUrl;
  }

  if (isConfiguredApkUrl(fallbackUrl)) {
    return fallbackUrl;
  }

  if (isStageEnv(appEnv)) {
    return "/warehubstage.apk";
  }

  if (isProdEnv(appEnv)) {
    return "/warehub.apk";
  }

  return "/warehub.apk";
}

export function resolveMobileApkUrlFromEnv(): string {
  const appEnv = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "";
  const stageUrl = process.env.MOBILE_STAGE_APK_URL ?? process.env.NEXT_PUBLIC_ANDROID_APK_URL_STAGE ?? "";
  const prodUrl = process.env.MOBILE_PROD_APK_URL ?? process.env.NEXT_PUBLIC_ANDROID_APK_URL_PROD ?? "";
  const fallbackUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "";

  return resolveMobileApkUrl(appEnv, stageUrl, prodUrl, fallbackUrl);
}
