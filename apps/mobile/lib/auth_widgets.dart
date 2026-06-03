import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';

class AuthGlowOrb extends StatelessWidget {
  const AuthGlowOrb({super.key, required this.size, required this.colors});

  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: colors),
        ),
      ),
    );
  }
}

class AuthGlassCard extends StatelessWidget {
  const AuthGlassCard({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: appCardGradient,
            border: Border.all(color: uiBorder),
            borderRadius: BorderRadius.circular(26),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x66000000),
                blurRadius: 30,
                offset: Offset(0, 18),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class AuthLoginForm extends StatelessWidget {
  const AuthLoginForm({
    super.key,
    required this.strings,
    required this.loginController,
    required this.passwordController,
    required this.passwordHidden,
    required this.isBusy,
    required this.onSubmit,
    required this.onTogglePassword,
  });

  final AppStrings strings;
  final TextEditingController loginController;
  final TextEditingController passwordController;
  final bool passwordHidden;
  final bool isBusy;
  final Future<void> Function() onSubmit;
  final VoidCallback onTogglePassword;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextField(
          controller: loginController,
          enabled: !isBusy,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: strings.username,
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: passwordController,
          enabled: !isBusy,
          obscureText: passwordHidden,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!isBusy) {
              unawaited(onSubmit());
            }
          },
          decoration: InputDecoration(
            labelText: strings.password,
            suffixIcon: IconButton(
              onPressed: isBusy ? null : onTogglePassword,
              icon: Icon(
                passwordHidden ? Icons.visibility : Icons.visibility_off,
                color: uiMuted,
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        AuthPrimaryCta(
          label: strings.login,
          isBusy: isBusy,
          onTap: () {
            if (!isBusy) {
              unawaited(onSubmit());
            }
          },
        ),
      ],
    );
  }
}

class AuthPrimaryCta extends StatelessWidget {
  const AuthPrimaryCta({
    super.key,
    required this.label,
    required this.onTap,
    this.isBusy = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool isBusy;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: appCtaGradient,
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x662A1E64),
            blurRadius: 22,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: FilledButton(
        onPressed: isBusy ? null : onTap,
        style: FilledButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        child: isBusy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.3,
                ),
              ),
      ),
    );
  }
}

class AuthLanguagePicker extends StatelessWidget {
  const AuthLanguagePicker({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final AppLang value;
  final ValueChanged<AppLang> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: uiCardSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: uiBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<AppLang>(
          value: value,
          isExpanded: true,
          isDense: true,
          dropdownColor: uiCard,
          icon: const Icon(Icons.language, size: 18, color: uiMuted),
          onChanged: (AppLang? lang) {
            if (lang != null) {
              onChanged(lang);
            }
          },
          selectedItemBuilder: (BuildContext context) {
            return AppLang.values
                .map(
                  (AppLang lang) => Row(
                    mainAxisSize: MainAxisSize.max,
                    children: <Widget>[
                      Text(
                        label,
                        style: const TextStyle(
                          color: uiMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          lang.label,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: uiText,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                )
                .toList();
          },
          items: AppLang.values
              .map(
                (AppLang lang) => DropdownMenuItem<AppLang>(
                  value: lang,
                  child: Text(
                    lang.label,
                    style: const TextStyle(
                      color: uiText,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}
