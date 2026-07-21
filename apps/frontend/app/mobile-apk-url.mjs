function isStageEnv(env) {
  const normalized = env.trim().toLowerCase();
  return normalized === "stage" || normalized === "staging";
}

function isProdEnv(env) {
  const normalized = env.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

export const MOBILE_APK_DOWNLOAD_PATH = "/mobile/download";

function isConfiguredApkUrl(value) {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("TODO_") || normalized.includes("__SET_")) {
    return false;
  }

  return normalized.startsWith("/") || normalized.startsWith("https://") || normalized.startsWith("http://");
}

export function resolveMobileApkUrl(appEnv, stageUrl, prodUrl, fallbackUrl) {
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
