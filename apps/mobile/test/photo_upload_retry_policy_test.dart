import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/photo_upload_retry_policy.dart';

void main() {
  test('default policy is deterministic', () {
    const PhotoUploadRetryPolicy policy = PhotoUploadRetryPolicy();
    expect(policy.delayMs, 350);
    expect(policy.maxAutomaticAttempts, 2);
  });

  test('applyRecoveredCount subtracts and clamps to zero', () {
    expect(applyRecoveredCount(failed: 5, recovered: 2), 3);
    expect(applyRecoveredCount(failed: 2, recovered: 7), 0);
  });

  test('applyRecoveredCount keeps failed when recovered is non-positive', () {
    expect(applyRecoveredCount(failed: 4, recovered: 0), 4);
    expect(applyRecoveredCount(failed: 4, recovered: -1), 4);
  });

  test('shouldAskManualRetry returns true only for positive failures', () {
    expect(shouldAskManualRetry(failedCount: 0), false);
    expect(shouldAskManualRetry(failedCount: -2), false);
    expect(shouldAskManualRetry(failedCount: 1), true);
  });
}
