class PhotoUploadTelemetry {
  const PhotoUploadTelemetry({
    required this.attempted,
    required this.failedInitial,
    required this.recovered,
    required this.failedFinal,
  });

  final int attempted;
  final int failedInitial;
  final int recovered;
  final int failedFinal;
}

String formatPhotoUploadTelemetry(PhotoUploadTelemetry telemetry) {
  return 'attempted=${telemetry.attempted} '
      'failed_initial=${telemetry.failedInitial} '
      'recovered=${telemetry.recovered} '
      'failed_final=${telemetry.failedFinal}';
}

PhotoUploadTelemetry buildPhotoUploadTelemetry({
  required int attempted,
  required int failedInitial,
  required int recovered,
  required int failedFinal,
}) {
  int clamp(int value) => value < 0 ? 0 : value;

  return PhotoUploadTelemetry(
    attempted: clamp(attempted),
    failedInitial: clamp(failedInitial),
    recovered: clamp(recovered),
    failedFinal: clamp(failedFinal),
  );
}
