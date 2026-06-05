import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/intake_photo_folder.dart';

void main() {
  test('buildIntakePhotoFolder normalizes and combines section/location', () {
    expect(buildIntakePhotoFolder(' d ', ' a12 '), 'D_A12');
  });

  test('buildIntakePhotoFolder keeps underscores and uppercases values', () {
    expect(buildIntakePhotoFolder('ab', 'c_17z'), 'AB_C_17Z');
  });

  test('buildIntakePhotoFolder sanitizes separators and duplicate delimiters',
      () {
    expect(
      buildIntakePhotoFolder(r' sec-1\\', r' room:/a-12  b '),
      'SEC_1_ROOM_A_12_B',
    );
  });

  test('buildIntakePhotoFolder supports empty inputs deterministically', () {
    expect(buildIntakePhotoFolder('', ''), '_');
  });

  test('normalizeIntakePhotoFolderToken drops unsupported symbols', () {
    expect(normalizeIntakePhotoFolderToken(' @@ D*12 '), 'D12');
  });

  test('parseIntakePhotoFolder splits first underscore only', () {
    expect(
      parseIntakePhotoFolder('D_A_12'),
      (section: 'D', warehouseLocation: 'A_12'),
    );
  });

  test('parseIntakePhotoFolder handles value without separator', () {
    expect(
      parseIntakePhotoFolder('ONLYSECTION'),
      (section: 'ONLYSECTION', warehouseLocation: ''),
    );
  });
}
