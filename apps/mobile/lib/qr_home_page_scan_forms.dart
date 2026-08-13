part of 'qr_home_page.dart';

enum _PhotoPickSource { camera, gallery }

const TextStyle _scanDialogTitleStyle = TextStyle(
  color: uiText,
  fontSize: 24,
  fontWeight: FontWeight.w800,
);

const TextStyle _scanDialogBodyStyle = TextStyle(
  color: uiText,
  fontSize: 16,
  fontWeight: FontWeight.w600,
);

const TextStyle _scanDialogSubtitleStyle = TextStyle(
  color: uiMuted,
  fontSize: 15,
  fontWeight: FontWeight.w600,
);

const TextStyle _scanFieldTextStyle = TextStyle(
  color: uiText,
  fontSize: 18,
  fontWeight: FontWeight.w600,
);

const TextStyle _scanFieldLabelStyle = TextStyle(
  color: uiMuted,
  fontSize: 16,
  fontWeight: FontWeight.w600,
);

const TextStyle _scanOptionTextStyle = TextStyle(
  color: uiText,
  fontSize: 16,
  fontWeight: FontWeight.w800,
);

const TextStyle _scanActionTextStyle = TextStyle(
  fontSize: 16,
  fontWeight: FontWeight.w800,
);

extension _QrHomePageScanForms on _QrHomePageState {
  InputDecoration _scanInputDecoration({
    required String label,
    String? errorText,
  }) {
    return InputDecoration(
      labelText: label,
      errorText: errorText,
      labelStyle: _scanFieldLabelStyle,
      floatingLabelStyle: _scanFieldLabelStyle.copyWith(color: uiText),
    );
  }

  Future<void> _stabilizeUiAfterRouteTransition() async {
    await Future<void>.delayed(const Duration(milliseconds: 180));
    await WidgetsBinding.instance.endOfFrame;
  }

  Future<int?> _askRequiredInt({
    required String title,
    required String label,
    String initialValue = '',
    int minValue = 1,
    int? maxValue,
  }) async {
    final AppStrings strings = _strings;
    String currentValue = initialValue;
    final int? decision = await showDialog<int>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        String? errorText;
        return StatefulBuilder(
            builder: (BuildContext context, StateSetter setStateDialog) {
          return AlertDialog(
            title: Text(title, style: _scanDialogTitleStyle),
            content: TextFormField(
              initialValue: initialValue,
              style: _scanFieldTextStyle,
              keyboardType: TextInputType.number,
              autofocus: false,
              onChanged: (String value) {
                currentValue = value;
              },
              decoration: _scanInputDecoration(
                label: label,
                errorText: errorText,
              ),
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child:
                    Text(strings.text('cancel'), style: _scanActionTextStyle),
              ),
              FilledButton(
                onPressed: () {
                  final int? parsed = int.tryParse(currentValue.trim());
                  if (parsed == null || parsed < minValue) {
                    setStateDialog(() {
                      errorText = strings.format(
                        'enter_number_min',
                        <String, String>{'min': '$minValue'},
                      );
                    });
                    return;
                  }
                  if (maxValue != null && parsed > maxValue) {
                    setStateDialog(() {
                      errorText = strings.format(
                        'enter_number_range',
                        <String, String>{
                          'min': '$minValue',
                          'max': '$maxValue',
                        },
                      );
                    });
                    return;
                  }
                  Navigator.of(dialogContext).pop(parsed);
                },
                child: Text(strings.text('next'), style: _scanActionTextStyle),
              ),
            ],
          );
        });
      },
    );
    return decision;
  }

  Future<String?> _askRequiredText({
    required String title,
    required String label,
    String initialValue = '',
    String Function(String value)? normalizer,
    String? Function(String value)? validator,
  }) async {
    final AppStrings strings = _strings;
    String currentValue = initialValue;
    final String? decision = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        String? errorText;
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            return AlertDialog(
              title: Text(title, style: _scanDialogTitleStyle),
              content: TextFormField(
                initialValue: initialValue,
                style: _scanFieldTextStyle,
                autofocus: false,
                onChanged: (String value) {
                  currentValue = value;
                },
                decoration: _scanInputDecoration(
                  label: label,
                  errorText: errorText,
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child:
                      Text(strings.text('cancel'), style: _scanActionTextStyle),
                ),
                FilledButton(
                  onPressed: () {
                    String value = currentValue.trim();
                    if (normalizer != null) {
                      value = normalizer(value);
                    }
                    final String? validationError = validator?.call(value);
                    if (validationError != null) {
                      setStateDialog(() {
                        errorText = validationError;
                      });
                      return;
                    }
                    Navigator.of(dialogContext).pop(value);
                  },
                  child:
                      Text(strings.text('next'), style: _scanActionTextStyle),
                ),
              ],
            );
          },
        );
      },
    );
    return decision;
  }

  Future<String?> _askAddSource() async {
    return _askSourceDialog(
      actionLabel: _strings.text('add'),
      options: <_ScanSourceOption>[
        _ScanSourceOption(
          value: 'qr',
          title: _strings.text('scan_by_qr'),
          icon: Icons.qr_code_scanner_rounded,
          emphasized: true,
        ),
        _ScanSourceOption(
          value: 'kid',
          title: _strings.text('scan_by_kid'),
          icon: Icons.pin_outlined,
        ),
        _ScanSourceOption(
          value: 'empty',
          title: _strings.text('scan_source_empty'),
          icon: Icons.inventory_2_outlined,
        ),
      ],
    );
  }

  Future<String?> _askRemoveSource() async {
    return _askSourceDialog(
      actionLabel: _strings.text('remove'),
      options: <_ScanSourceOption>[
        _ScanSourceOption(
          value: 'qr',
          title: _strings.text('scan_by_qr'),
          icon: Icons.qr_code_scanner_rounded,
          emphasized: true,
        ),
        _ScanSourceOption(
          value: 'manual',
          title: _strings.text('scan_by_section_slot'),
          icon: Icons.grid_view_rounded,
        ),
      ],
    );
  }

  Future<String?> _askSourceDialog({
    required String actionLabel,
    required List<_ScanSourceOption> options,
  }) async {
    final AppStrings strings = _strings;
    return showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) {
        return Dialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  strings.text('scan_source_title'),
                  textAlign: TextAlign.center,
                  style: _scanDialogTitleStyle,
                ),
                const SizedBox(height: 6),
                Text(
                  strings.format(
                    'scan_source_subtitle',
                    <String, String>{'action': actionLabel},
                  ),
                  textAlign: TextAlign.center,
                  style: _scanDialogSubtitleStyle,
                ),
                const SizedBox(height: 14),
                ...options.map(
                  (_ScanSourceOption option) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _ScanDialogActionButton(
                      label: option.title,
                      icon: option.icon,
                      emphasized: option.emphasized,
                      trailingIcon: Icons.chevron_right_rounded,
                      onPressed: () =>
                          Navigator.of(dialogContext).pop(option.value),
                    ),
                  ),
                ),
                _ScanDialogActionButton(
                  label: strings.text('cancel'),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<String?> _askSectionSelection({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    String selected = 'D';
    final String? decision = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            return AlertDialog(
              title: Text(title, style: _scanDialogTitleStyle),
              content: SizedBox(
                width: 360,
                child: LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    final bool compact = constraints.maxWidth < 340;
                    final int columns = compact ? 3 : 4;
                    return GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: columns,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: compact ? 1.7 : 2.0,
                      children: kWarehouseSections.map((String section) {
                        final bool isSelected = selected == section;
                        return _buildChoiceTile(
                          label: warehouseSectionLabel(section),
                          selected: isSelected,
                          onTap: () {
                            setStateDialog(() {
                              selected = section;
                            });
                          },
                        );
                      }).toList(),
                    );
                  },
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child:
                      Text(strings.text('cancel'), style: _scanActionTextStyle),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child:
                      Text(strings.text('next'), style: _scanActionTextStyle),
                ),
              ],
            );
          },
        );
      },
    );
    return decision;
  }

  Future<String?> _askColorSelectionGerman({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    String? selected;
    final String? decision = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            return AlertDialog(
              title: Text(title, style: _scanDialogTitleStyle),
              content: SizedBox(
                width: 360,
                child: GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 3,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.85,
                  children: kGermanColors.map((String colorName) {
                    final bool isSelected = selected == colorName;
                    final _ColorTilePalette palette =
                        _colorTilePaletteFor(colorName, isSelected);
                    return _buildChoiceTile(
                      label: _localizedGermanColorName(strings, colorName),
                      selected: isSelected,
                      backgroundColor: palette.background,
                      borderColor: palette.border,
                      textColor: palette.text,
                      enlargeWhenSelected: true,
                      onTap: () {
                        setStateDialog(() {
                          selected = colorName;
                        });
                      },
                    );
                  }).toList(),
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child:
                      Text(strings.text('skip'), style: _scanActionTextStyle),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child:
                      Text(strings.text('next'), style: _scanActionTextStyle),
                ),
              ],
            );
          },
        );
      },
    );
    return decision;
  }

  String _localizedGermanColorName(AppStrings strings, String value) {
    return strings.text('color_${value.trim().toLowerCase()}');
  }

  Future<bool> _askBWareSelection({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    return _askYesNo(
      title: title,
      message: strings.text('b_ware_question'),
      yes: strings.text('yes'),
      no: strings.text('no'),
    );
  }

  Future<bool> _askInTransitSelection({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    return _askYesNo(
      title: title,
      message: strings.text('in_transit_question'),
      yes: strings.text('yes'),
      no: strings.text('no'),
    );
  }

  Future<bool?> _askStoreDestinationSelection({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return Dialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(title, style: _scanDialogTitleStyle),
                const SizedBox(height: 14),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: _ScanDialogActionButton(
                        label: strings.text('store_destination_store'),
                        icon: Icons.storefront_rounded,
                        emphasized: true,
                        onPressed: () => Navigator.of(dialogContext).pop(true),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ScanDialogActionButton(
                        label: strings.text('store_destination_warehouse'),
                        icon: Icons.warehouse_rounded,
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _ScanDialogActionButton(
                  label: strings.text('cancel'),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<String?> _askOptionalComment({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    final String? value = await _askRequiredText(
      title: title,
      label: strings.text('b_ware_comment'),
      validator: (_) => null,
    );
    if (value == null) {
      return null;
    }
    final String normalized = value.trim();
    if (normalized.isEmpty) {
      return null;
    }
    return normalized;
  }

  Future<_CategorySelection?> _askCategorySelection({
    required String title,
  }) async {
    final AppStrings strings = _strings;
    String selectedMain = '';
    String selectedSub = '';
    final _CategorySelection? decision = await showDialog<_CategorySelection>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            final List<String> subOptions = selectedMain.isEmpty
                ? const <String>[]
                : (kCategorySubOptionsGerman[selectedMain] ?? const <String>[]);
            if (selectedSub.isNotEmpty && !subOptions.contains(selectedSub)) {
              selectedSub = '';
            }
            return AlertDialog(
              title: Text(title, style: _scanDialogTitleStyle),
              content: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    AppSelectField<String>(
                      label: strings.text('category_optional'),
                      value: selectedMain,
                      options: <AppSelectOption<String>>[
                        AppSelectOption<String>(
                          value: '',
                          label: strings.text('no_selection'),
                        ),
                        ...kCategoryMainOptionsGerman.map(
                          (String main) => AppSelectOption<String>(
                            value: main,
                            label: main,
                          ),
                        ),
                      ],
                      onChanged: (String value) {
                        setStateDialog(() {
                          selectedMain = value;
                          selectedSub = '';
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    AppSelectField<String>(
                      label: strings.text('subcategory_optional'),
                      value: selectedSub,
                      options: <AppSelectOption<String>>[
                        AppSelectOption<String>(
                          value: '',
                          label: strings.text('no_selection'),
                        ),
                        ...subOptions.map(
                          (String sub) => AppSelectOption<String>(
                            value: sub,
                            label: sub,
                          ),
                        ),
                      ],
                      onChanged: selectedMain.isEmpty
                          ? null
                          : (String value) {
                              setStateDialog(() {
                                selectedSub = value;
                              });
                            },
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child:
                      Text(strings.text('cancel'), style: _scanActionTextStyle),
                ),
                FilledButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop(
                      _CategorySelection(
                        main: selectedMain.isEmpty ? null : selectedMain,
                        sub: selectedSub.isEmpty ? null : selectedSub,
                      ),
                    );
                  },
                  child:
                      Text(strings.text('next'), style: _scanActionTextStyle),
                ),
              ],
            );
          },
        );
      },
    );
    return decision;
  }

  Widget _buildChoiceTile({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    Color? backgroundColor,
    Color? borderColor,
    Color? textColor,
    bool enlargeWhenSelected = false,
  }) {
    final Color fillColor = backgroundColor ??
        (selected ? uiGreen.withValues(alpha: 0.12) : uiCardSoft);
    final Color labelColor = textColor ?? uiText;
    final double scale = enlargeWhenSelected && selected ? 1.08 : 1;

    return AnimatedScale(
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeOutCubic,
      scale: scale,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.fade,
            softWrap: true,
            style: TextStyle(
              fontWeight: _scanOptionTextStyle.fontWeight,
              fontSize: _scanOptionTextStyle.fontSize,
              color: labelColor,
            ),
          ),
        ),
      ),
    );
  }

  Future<bool> _askYesNo({
    required String title,
    required String message,
    String yes = 'Yes',
    String no = 'No',
  }) async {
    final bool? value = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: Text(title, style: _scanDialogTitleStyle),
          content: Text(message, style: _scanDialogBodyStyle),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(no, style: _scanActionTextStyle),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(yes, style: _scanActionTextStyle),
            ),
          ],
        );
      },
    );
    return value ?? false;
  }

  Future<_PhotoPickSource?> _askPhotoSourceChoice({
    required String title,
    required String message,
    required String dismissLabel,
  }) async {
    final AppStrings strings = _strings;
    return showDialog<_PhotoPickSource>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: Text(title, style: _scanDialogTitleStyle),
          content: Text(message, style: _scanDialogBodyStyle),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(dismissLabel, style: _scanActionTextStyle),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(_PhotoPickSource.gallery),
              child: Text(strings.text('gallery'), style: _scanActionTextStyle),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(_PhotoPickSource.camera),
              child: Text(strings.text('take_photos'),
                  style: _scanActionTextStyle),
            ),
          ],
        );
      },
    );
  }

  Future<List<XFile>> _pickGalleryPhotosUpTo(int maxCount) async {
    if (maxCount <= 0) {
      return <XFile>[];
    }
    final List<XFile> picked = await _imagePicker.pickMultiImage(
      imageQuality: 88,
      limit: maxCount,
    );
    return picked.take(maxCount).toList();
  }

  Future<List<XFile>> _captureCameraPhotosUpTo(int maxCount) async {
    final List<XFile> photos = <XFile>[];
    final AppStrings strings = _strings;
    while (photos.length < maxCount) {
      final XFile? shot = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 88,
      );
      if (shot != null) {
        photos.add(shot);
      }
      if (photos.length >= maxCount) {
        break;
      }
      final bool addMore = await _askYesNo(
        title: strings.format('photo_title', <String, String>{
          'current': '${photos.length}',
          'total': '$maxCount',
        }),
        message: strings.text('add_one_more_photo'),
        yes: strings.text('add_photo'),
        no: strings.text('continue'),
      );
      if (!addMore) {
        break;
      }
    }
    return photos;
  }

  Future<List<XFile>> _capturePhotosUpTo10({
    int step = 4,
    int total = 4,
    bool askToStart = true,
    int maxCount = 10,
  }) async {
    final AppStrings strings = _strings;
    final _PhotoPickSource? source = await _askPhotoSourceChoice(
      title: askToStart
          ? strings.format(
              'step_title',
              <String, String>{'step': '$step', 'total': '$total'},
            )
          : strings.text('add_photos'),
      message: strings.text('take_photos_question'),
      dismissLabel:
          askToStart ? strings.text('skip_photos') : strings.text('cancel'),
    );
    if (source == null) {
      return <XFile>[];
    }
    return source == _PhotoPickSource.gallery
        ? _pickGalleryPhotosUpTo(maxCount)
        : _captureCameraPhotosUpTo(maxCount);
  }
}

class _ScanDialogActionButton extends StatefulWidget {
  const _ScanDialogActionButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.trailingIcon,
    this.emphasized = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconData? trailingIcon;
  final bool emphasized;

  @override
  State<_ScanDialogActionButton> createState() =>
      _ScanDialogActionButtonState();
}

class _ScanDialogActionButtonState extends State<_ScanDialogActionButton> {
  bool _pressed = false;

  void _setPressed(bool pressed) {
    if (_pressed == pressed || widget.onPressed == null) {
      return;
    }
    setState(() {
      _pressed = pressed;
    });
  }

  @override
  Widget build(BuildContext context) {
    final bool enabled = widget.onPressed != null;
    final bool hasTrailing = widget.trailingIcon != null;
    final Color background = widget.emphasized ? uiText : uiCardSoft;
    final Color foreground = widget.emphasized ? Colors.white : uiText;
    final Color mutedForeground =
        widget.emphasized ? Colors.white.withValues(alpha: 0.72) : uiMuted;

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 140),
      opacity: enabled ? 1 : 0.50,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 100),
        curve: Curves.easeOutCubic,
        scale: _pressed ? 0.97 : 1,
        child: InkWell(
          onTap: widget.onPressed,
          onTapDown: enabled ? (_) => _setPressed(true) : null,
          onTapUp: enabled ? (_) => _setPressed(false) : null,
          onTapCancel: enabled ? () => _setPressed(false) : null,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisAlignment: hasTrailing
                  ? MainAxisAlignment.start
                  : MainAxisAlignment.center,
              children: <Widget>[
                if (widget.icon != null) ...<Widget>[
                  Icon(widget.icon, size: 22, color: foreground),
                  const SizedBox(width: 10),
                ],
                Flexible(
                  fit: hasTrailing ? FlexFit.tight : FlexFit.loose,
                  child: Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: hasTrailing ? TextAlign.start : TextAlign.center,
                    style: _scanOptionTextStyle.copyWith(color: foreground),
                  ),
                ),
                if (widget.trailingIcon != null) ...<Widget>[
                  const SizedBox(width: 10),
                  Icon(widget.trailingIcon, size: 22, color: mutedForeground),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
