import 'dart:async';

import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'auth_design_tokens.dart';

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
    return DecoratedBox(
      decoration: const BoxDecoration(color: AuthColors.card),
      child: Padding(
        padding: const EdgeInsets.all(AuthSpacing.xl),
        child: child,
      ),
    );
  }
}

class AuthBrandHeader extends StatelessWidget {
  const AuthBrandHeader({
    super.key,
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(AuthRadii.lg),
              child: Image.asset(
                'assets/images/logo.png',
                width: AuthSpacing.logoSize,
                height: AuthSpacing.logoSize,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: AuthSpacing.md),
            const Text('Warehub', style: AuthTextStyles.brand),
          ],
        ),
        const SizedBox(height: AuthSpacing.xl),
        Text(
          title,
          textAlign: TextAlign.center,
          style: AuthTextStyles.title,
        ),
        const SizedBox(height: AuthSpacing.sm),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: AuthTextStyles.subtitle,
        ),
      ],
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
    required this.onForgotPassword,
  });

  final AppStrings strings;
  final TextEditingController loginController;
  final TextEditingController passwordController;
  final bool passwordHidden;
  final bool isBusy;
  final Future<void> Function() onSubmit;
  final VoidCallback onTogglePassword;
  final VoidCallback onForgotPassword;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        AuthTextField(
          controller: loginController,
          enabled: !isBusy,
          label: strings.username,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: AuthSpacing.md),
        AuthTextField(
          controller: passwordController,
          enabled: !isBusy,
          label: strings.password,
          obscureText: passwordHidden,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!isBusy) {
              unawaited(onSubmit());
            }
          },
          suffix: IconButton(
            onPressed: isBusy ? null : onTogglePassword,
            icon: Icon(
              passwordHidden ? Icons.visibility : Icons.visibility_off,
              color: AuthColors.mutedForeground,
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: isBusy ? null : onForgotPassword,
            style: TextButton.styleFrom(
              foregroundColor: AuthColors.foreground,
              padding: const EdgeInsets.symmetric(
                horizontal: AuthSpacing.xs,
                vertical: AuthSpacing.sm,
              ),
            ),
            child: Text(
              strings.text('forgot_password'),
              style: AuthTextStyles.label,
            ),
          ),
        ),
        const SizedBox(height: AuthSpacing.lg),
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

class AuthTextField extends StatelessWidget {
  const AuthTextField({
    super.key,
    required this.controller,
    required this.label,
    this.enabled = true,
    this.obscureText = false,
    this.textInputAction,
    this.onSubmitted,
    this.suffix,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Widget? suffix;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label, style: AuthTextStyles.label),
        const SizedBox(height: AuthSpacing.xs),
        SizedBox(
          height: AuthSpacing.inputHeight,
          child: TextField(
            controller: controller,
            enabled: enabled,
            obscureText: obscureText,
            keyboardType: keyboardType,
            textInputAction: textInputAction,
            onSubmitted: onSubmitted,
            style: AuthTextStyles.input,
            cursorColor: AuthColors.foreground,
            decoration: InputDecoration(
              filled: true,
              fillColor: AuthColors.muted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AuthRadii.md),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AuthRadii.md),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AuthRadii.md),
                borderSide: BorderSide.none,
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AuthRadii.md),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: AuthSpacing.md,
                vertical: AuthSpacing.md,
              ),
              suffixIcon: suffix,
            ),
          ),
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
    return SizedBox(
      height: AuthSpacing.buttonHeight,
      child: FilledButton(
        onPressed: isBusy ? null : onTap,
        style: FilledButton.styleFrom(
          backgroundColor: AuthColors.primary,
          disabledBackgroundColor: AuthColors.primary.withValues(alpha: 0.5),
          foregroundColor: AuthColors.primaryForeground,
          disabledForegroundColor:
              AuthColors.primaryForeground.withValues(alpha: 0.7),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          padding: const EdgeInsets.symmetric(horizontal: AuthSpacing.lg),
        ),
        child: isBusy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AuthColors.primaryForeground,
                ),
              )
            : Text(
                label,
                style: AuthTextStyles.button,
              ),
      ),
    );
  }
}

class AuthLanguagePicker extends StatefulWidget {
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
  State<AuthLanguagePicker> createState() => _AuthLanguagePickerState();
}

class _AuthLanguagePickerState extends State<AuthLanguagePicker> {
  final OverlayPortalController _overlayController = OverlayPortalController();
  final LayerLink _layerLink = LayerLink();
  bool _expanded = false;

  void _toggleExpanded() {
    setState(() {
      _expanded = !_expanded;
      if (_expanded) {
        _overlayController.show();
      } else {
        _overlayController.hide();
      }
    });
  }

  void _selectLanguage(AppLang lang) {
    widget.onChanged(lang);
    setState(() {
      _expanded = false;
      _overlayController.hide();
    });
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: OverlayPortal(
        controller: _overlayController,
        overlayChildBuilder: (BuildContext context) {
          return Stack(
            children: <Widget>[
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: _toggleExpanded,
                  child: const SizedBox.expand(),
                ),
              ),
              CompositedTransformFollower(
                link: _layerLink,
                showWhenUnlinked: false,
                targetAnchor: Alignment.centerRight,
                followerAnchor: Alignment.centerRight,
                offset: const Offset(-48, 0),
                child: _LanguageOverlayPanel(
                  value: widget.value,
                  onSelect: _selectLanguage,
                ),
              ),
            ],
          );
        },
        child: IconButton(
          tooltip: widget.label,
          onPressed: _toggleExpanded,
          icon: AnimatedRotation(
            turns: _expanded ? -0.08 : 0,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            child: const Icon(
              Icons.language,
              color: AuthColors.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

class _LanguageOverlayPanel extends StatelessWidget {
  const _LanguageOverlayPanel({
    required this.value,
    required this.onSelect,
  });

  final AppLang value;
  final ValueChanged<AppLang> onSelect;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: 1),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        builder: (BuildContext context, double progress, Widget? child) {
          return Opacity(
            opacity: progress,
            child: Transform.translate(
              offset: Offset(10 * (1 - progress), 0),
              child: Transform.scale(
                alignment: Alignment.centerRight,
                scale: 0.98 + (0.02 * progress),
                child: child,
              ),
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AuthSpacing.xs,
            vertical: AuthSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: AuthColors.card,
            borderRadius: BorderRadius.circular(AuthRadii.lg),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: AuthColors.foreground.withValues(alpha: 0.12),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: AppLang.values
                .map(
                  (AppLang lang) => _AnimatedLanguageOption(
                    lang: lang,
                    isSelected: lang == value,
                    onTap: () => onSelect(lang),
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _AnimatedLanguageOption extends StatelessWidget {
  const _AnimatedLanguageOption({
    required this.lang,
    required this.isSelected,
    required this.onTap,
  });

  final AppLang lang;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: Duration(milliseconds: 170 + AppLang.values.indexOf(lang) * 50),
      curve: Curves.easeOutCubic,
      builder: (BuildContext context, double value, Widget? child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(12 * (1 - value), 0),
            child: child,
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(right: AuthSpacing.xs),
        child: Material(
          color: isSelected ? AuthColors.muted : Colors.transparent,
          borderRadius: BorderRadius.circular(AuthRadii.md),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AuthRadii.md),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AuthSpacing.md,
                vertical: AuthSpacing.sm,
              ),
              child: Text(
                lang.label,
                style: AuthTextStyles.language.copyWith(
                  color: isSelected
                      ? AuthColors.foreground
                      : AuthColors.mutedForeground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
