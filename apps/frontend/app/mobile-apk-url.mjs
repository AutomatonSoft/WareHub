function isStageEnv(env) {
  const normalized = env.trim().toLowerCase();
  return normalized === "stage" || normalized === "staging";
}

function isProdEnv(env) {
  const normalized = env.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

export function resolveMobileApkUrl(appEnv, stageUrl, prodUrl, fallbackUrl) {
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
