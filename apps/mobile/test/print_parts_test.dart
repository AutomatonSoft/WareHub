import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/print_parts.dart';

void main() {
  test('buildPrintPartsCaptions returns 1..N for multi quantity print', () {
    final List<String?> result = buildPrintPartsCaptions(
      quantity: 5,
      unitIndex: 1,
      totalParts: 5,
    );

    expect(result, <String?>['1/5', '2/5', '3/5', '4/5', '5/5']);
  });

  test('buildPrintPartsCaptions uses unitIndex/totalParts for single label',
      () {
    final List<String?> result = buildPrintPartsCaptions(
      quantity: 1,
      unitIndex: 2,
      totalParts: 5,
    );

    expect(result, <String?>['2/5']);
  });

  test('buildPrintPartsCaptions returns null caption for plain single label',
      () {
    final List<String?> result = buildPrintPartsCaptions(
      quantity: 1,
      unitIndex: 1,
      totalParts: 1,
    );

    expect(result, <String?>[null]);
  });

  test('buildPrintPartsCaptions clamps invalid input to safe values', () {
    final List<String?> result = buildPrintPartsCaptions(
      quantity: 0,
      unitIndex: 0,
      totalParts: 0,
    );

    expect(result, <String?>[null]);
  });

  test('nativeNiimbotLabelType keeps values accepted by the Android plugin', () {
    expect(nativeNiimbotLabelType(1), 1);
    expect(nativeNiimbotLabelType(2), 2);
    expect(nativeNiimbotLabelType(3), 3);
  });

  test('nativeNiimbotLabelType safely falls back for unsupported settings', () {
    expect(nativeNiimbotLabelType(0), 1);
    expect(nativeNiimbotLabelType(4), 1);
    expect(nativeNiimbotLabelType(5), 1);
  });
}
