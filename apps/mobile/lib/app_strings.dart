import 'package:flutter/widgets.dart';

import 'app_language.dart';
import 'app_settings_scope.dart';
import 'app_strings_de.dart';
import 'app_strings_en.dart';
import 'app_strings_ru.dart';

class AppStrings {
  const AppStrings(this.lang);

  final AppLang lang;

  static AppStrings of(BuildContext context) {
    return AppStrings(AppSettingsScope.of(context).language);
  }

  String get login => _t('login');
  String get loginTitle => _t('login_title');
  String get loginSubtitle => _t('login_subtitle');
  String get username => _t('username');
  String get password => _t('password');
  String get language => _t('language');

  String text(String key) => _t(key);

  String format(String key, Map<String, String> values) {
    String text = _t(key);
    values.forEach((String name, String value) {
      text = text.replaceAll('{$name}', value);
    });
    return text;
  }

  String _t(String key) {
    return _labels[lang]?[key] ?? _labels[AppLang.en]?[key] ?? key;
  }
}

const Map<AppLang, Map<String, String>> _labels =
    <AppLang, Map<String, String>>{
  AppLang.en: appLabelsEn,
  AppLang.ru: appLabelsRu,
  AppLang.de: appLabelsDe,
};
