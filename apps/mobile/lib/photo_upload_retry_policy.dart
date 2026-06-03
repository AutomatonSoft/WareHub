class PhotoUploadRetryPolicy {
  const PhotoUploadRetryPolicy({
    this.delayMs = 350,
    this.maxAutomaticAttempts = 2,
  });

  final int delayMs;
  final int maxAutomaticAttempts;
}

int applyRecoveredCount({
  required int failed,
  required int recovered,
}) {
  if (failed <= 0 || recovered <= 0) {
    return failed;
  }
  final int next = failed - recovered;
  return next < 0 ? 0 : next;
}

bool shouldAskManualRetry({
  required int failedCount,
}) {
  return failedCount > 0;
}
