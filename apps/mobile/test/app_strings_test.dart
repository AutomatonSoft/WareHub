import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_language.dart';
import 'package:sofortbot_mobile/app_strings.dart';

void main() {
  test('Russian inventory card labels are fully localized', () {
    const AppStrings strings = AppStrings(AppLang.ru);

    expect(strings.text('store_destination_store'), 'Магазин');
    expect(strings.text('store_destination_warehouse'), 'Склад');
    expect(strings.text('b_ware'), 'Уценённый товар');
    expect(strings.text('in_transit'), 'В пути');
  });

  test('profile labels and contract values are localized', () {
    const AppStrings russian = AppStrings(AppLang.ru);
    const AppStrings german = AppStrings(AppLang.de);

    expect(russian.text('email_value'), 'Электронная почта');
    expect(russian.text('profile_username'), 'Имя пользователя');
    expect(russian.profileRoleLabel('admin'), 'Администратор');
    expect(russian.profileRoleLabel('worker'), 'Пользователь');
    expect(russian.profileStatusLabel('approved'), 'Подтверждён');
    expect(russian.profileStatusLabel(''), 'Неизвестно');

    expect(german.profileRoleLabel('user'), 'Benutzer');
    expect(german.profileStatusLabel('rejected'), 'Abgelehnt');
  });

  test('unknown profile contract values remain readable', () {
    const AppStrings strings = AppStrings(AppLang.en);

    expect(strings.profileRoleLabel('shift_manager'), 'Shift manager');
    expect(strings.profileStatusLabel('ON-HOLD'), 'On hold');
  });
}
