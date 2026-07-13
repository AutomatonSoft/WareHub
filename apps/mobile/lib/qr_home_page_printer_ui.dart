part of 'qr_home_page.dart';

const double _printerDialogWidth = 360;
const double _printerDialogRadius = 28;

const TextStyle _printerDialogTitleStyle = TextStyle(
  color: uiText,
  fontSize: 26,
  fontWeight: FontWeight.w700,
  height: 1.12,
);

const TextStyle _printerFieldTextStyle = TextStyle(
  color: uiText,
  fontSize: 17,
  fontWeight: FontWeight.w500,
);

const TextStyle _printerFieldLabelStyle = TextStyle(
  color: uiText,
  fontSize: 14,
  fontWeight: FontWeight.w500,
);

const TextStyle _printerBodyStyle = TextStyle(
  color: uiText,
  fontSize: 16,
  fontWeight: FontWeight.w500,
  height: 1.35,
);

const TextStyle _printerButtonTextStyle = TextStyle(
  fontSize: 16,
  fontWeight: FontWeight.w800,
);

RoundedRectangleBorder _printerDialogShape() {
  return RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(_printerDialogRadius),
  );
}

InputDecoration _printerInputDecoration(String label) {
  final OutlineInputBorder border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(AuthRadii.md),
    borderSide: BorderSide.none,
  );

  return InputDecoration(
    labelText: label,
    labelStyle: _printerFieldLabelStyle,
    floatingLabelStyle: _printerFieldLabelStyle,
    filled: true,
    fillColor: uiCardSoft,
    border: border,
    enabledBorder: border,
    focusedBorder: border,
    disabledBorder: border,
    errorBorder: border,
    focusedErrorBorder: border,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: AuthSpacing.md,
      vertical: AuthSpacing.lg,
    ),
  );
}

class _PrinterPrimaryButton extends StatelessWidget {
  const _PrinterPrimaryButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AuthSpacing.buttonHeight,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: uiText,
          foregroundColor: Colors.white,
          disabledBackgroundColor: uiText.withValues(alpha: 0.40),
          disabledForegroundColor: Colors.white.withValues(alpha: 0.72),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          textStyle: _printerButtonTextStyle,
        ),
        child: _PrinterButtonLabel(label: label),
      ),
    );
  }
}

class _PrinterSecondaryButton extends StatelessWidget {
  const _PrinterSecondaryButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AuthSpacing.buttonHeight,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: uiText,
          disabledForegroundColor: uiMuted,
          side: const BorderSide(color: AuthColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          textStyle: _printerButtonTextStyle,
        ),
        child: Text(label),
      ),
    );
  }
}

class _PrinterTextButton extends StatelessWidget {
  const _PrinterTextButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          foregroundColor: uiText,
          disabledForegroundColor: uiMuted,
          textStyle: _printerButtonTextStyle,
        ),
        child: Text(label),
      ),
    );
  }
}

class _PrinterButtonLabel extends StatelessWidget {
  const _PrinterButtonLabel({
    required this.label,
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
