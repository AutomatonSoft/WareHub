enum AppLang { en, ru, de }

extension AppLangX on AppLang {
  String get code {
    switch (this) {
      case AppLang.en:
        return 'en';
      case AppLang.ru:
        return 'ru';
      case AppLang.de:
        return 'de';
    }
  }

  String get label {
    switch (this) {
      case AppLang.en:
        return 'English';
      case AppLang.ru:
        return 'Русский';
      case AppLang.de:
        return 'Deutsch';
    }
  }

  static AppLang fromCode(String? code) {
    switch (code) {
      case 'ru':
        return AppLang.ru;
      case 'de':
        return AppLang.de;
      case 'en':
      default:
        return AppLang.en;
    }
  }
}
