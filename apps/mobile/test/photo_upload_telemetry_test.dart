import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/photo_upload_telemetry.dart';

void main() {
  test('buildPhotoUploadTelemetry clamps negative values', () {
    final PhotoUploadTelemetry telemetry = buildPhotoUploadTelemetry(
      attempted: -1,
      failedInitial: -2,
      recovered: -3,
      failedFinal: -4,
    );

    expect(telemetry.attempted, 0);
    expect(telemetry.failedInitial, 0);
    expect(telemetry.recovered, 0);
    expect(telemetry.failedFinal, 0);
  });

  test('formatPhotoUploadTelemetry renders compact counter string', () {
    const PhotoUploadTelemetry telemetry = PhotoUploadTelemetry(
      attempted: 10,
      failedInitial: 4,
      recovered: 3,
      failedFinal: 1,
    );

    expect(
      formatPhotoUploadTelemetry(telemetry),
      'attempted=10 failed_initial=4 recovered=3 failed_final=1',
    );
  });
}
