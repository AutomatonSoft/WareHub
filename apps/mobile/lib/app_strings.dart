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

  String profileRoleLabel(String value) {
    switch (_normalizeEnumValue(value)) {
      case 'admin':
        return _t('profile_role_admin');
      case 'user':
      case 'worker':
        return _t('profile_role_user');
      case '':
        return _t('profile_role_user');
      default:
        return _humanizeEnumValue(value);
    }
  }

  String profileStatusLabel(String value) {
    switch (_normalizeEnumValue(value)) {
      case 'pending':
        return _t('profile_status_pending');
      case 'approved':
        return _t('profile_status_approved');
      case 'rejected':
        return _t('profile_status_rejected');
      case '':
        return _t('profile_status_unknown');
      default:
        return _humanizeEnumValue(value);
    }
  }

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

  String _normalizeEnumValue(String value) => value.trim().toLowerCase();

  String _humanizeEnumValue(String value) {
    final String normalized = value.trim().replaceAll(RegExp(r'[_-]+'), ' ');
    if (normalized.isEmpty) {
      return '-';
    }
    return normalized[0].toUpperCase() + normalized.substring(1).toLowerCase();
  }
}

const Map<AppLang, Map<String, String>> _labels =
    <AppLang, Map<String, String>>{
  AppLang.en: appLabelsEn,
  AppLang.ru: appLabelsRu,
  AppLang.de: appLabelsDe,
};
