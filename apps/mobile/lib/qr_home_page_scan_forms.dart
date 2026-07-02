part of 'qr_home_page.dart';

extension _QrHomePageScanForms on _QrHomePageState {
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
            title: Text(title),
            content: TextFormField(
              initialValue: initialValue,
              keyboardType: TextInputType.number,
              autofocus: false,
              onChanged: (String value) {
                currentValue = value;
              },
              decoration: InputDecoration(
                labelText: label,
                errorText: errorText,
              ),
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: Text(strings.text('cancel')),
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
                child: Text(strings.text('next')),
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
              title: Text(title),
              content: TextFormField(
                initialValue: initialValue,
                autofocus: false,
                onChanged: (String value) {
                  currentValue = value;
                },
                decoration: InputDecoration(
                  labelText: label,
                  errorText: errorText,
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
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
                  child: Text(strings.text('next')),
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
          accent: uiGreen,
          emphasized: true,
        ),
        _ScanSourceOption(
          value: 'kid',
          title: _strings.text('scan_by_kid'),
          icon: Icons.pin_outlined,
          accent: uiCyan,
        ),
        _ScanSourceOption(
          value: 'empty',
          title: _strings.text('scan_source_empty'),
          icon: Icons.inventory_2_outlined,
          accent: uiMuted,
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
          accent: uiOrangeDeep,
          emphasized: true,
        ),
        _ScanSourceOption(
          value: 'manual',
          title: _strings.text('scan_by_section_slot'),
          icon: Icons.grid_view_rounded,
          accent: uiCyan,
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
                  style: const TextStyle(
                    color: uiText,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  strings.format(
                    'scan_source_subtitle',
                    <String, String>{'action': actionLabel},
                  ),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: uiMuted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 14),
                ...options.map(
                  (_ScanSourceOption option) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _buildSourceActionTile(
                      option: option,
                      onTap: () =>
                          Navigator.of(dialogContext).pop(option.value),
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSourceActionTile({
    required _ScanSourceOption option,
    required VoidCallback onTap,
  }) {
    final Color fill =
        option.emphasized ? option.accent.withValues(alpha: 0.22) : uiCardSoft;
    final Color border =
        option.emphasized ? option.accent.withValues(alpha: 0.8) : uiBorder;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 58,
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: border, width: option.emphasized ? 1.4 : 1),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: <Widget>[
            Icon(option.icon, size: 24, color: uiText),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                option.title,
                style: const TextStyle(
                  color: uiText,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: uiMuted),
          ],
        ),
      ),
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
              title: Text(title),
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
                  child: Text(strings.text('cancel')),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(strings.text('next')),
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
              title: Text(title),
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
                      label: colorName,
                      selected: isSelected,
                      backgroundColor: palette.background,
                      borderColor: palette.border,
                      textColor: palette.text,
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
                  child: Text(strings.text('skip')),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(strings.text('next')),
                ),
              ],
            );
          },
        );
      },
    );
    return decision;
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
              title: Text(title),
              content: SizedBox(
                width: 360,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    DropdownButtonFormField<String>(
                      initialValue: selectedMain,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: strings.text('category_optional'),
                      ),
                      items: <DropdownMenuItem<String>>[
                        DropdownMenuItem<String>(
                          value: '',
                          child: Text(strings.text('no_selection')),
                        ),
                        ...kCategoryMainOptionsGerman.map(
                          (String main) => DropdownMenuItem<String>(
                            value: main,
                            child: Text(main),
                          ),
                        ),
                      ],
                      onChanged: (String? value) {
                        setStateDialog(() {
                          selectedMain = value ?? '';
                          selectedSub = '';
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedSub,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: strings.text('subcategory_optional'),
                      ),
                      items: <DropdownMenuItem<String>>[
                        DropdownMenuItem<String>(
                          value: '',
                          child: Text(strings.text('no_selection')),
                        ),
                        ...subOptions.map(
                          (String sub) => DropdownMenuItem<String>(
                            value: sub,
                            child: Text(sub),
                          ),
                        ),
                      ],
                      onChanged: selectedMain.isEmpty
                          ? null
                          : (String? value) {
                              setStateDialog(() {
                                selectedSub = value ?? '';
                              });
                            },
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
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
                  child: Text(strings.text('next')),
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
  }) {
    final Color tileBorderColor =
        borderColor ?? (selected ? uiGreen.withValues(alpha: 0.7) : uiBorder);
    final Color fillColor = backgroundColor ??
        (selected ? uiGreen.withValues(alpha: 0.22) : uiCardSoft);
    final Color labelColor = textColor ?? uiText;

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: fillColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: tileBorderColor, width: selected ? 1.4 : 1),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.fade,
          softWrap: true,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 13,
            color: labelColor,
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
          title: Text(title),
          content: Text(message),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(no),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(yes),
            ),
          ],
        );
      },
    );
    return value ?? false;
  }

  Future<List<XFile>> _capturePhotosUpTo10({
    int step = 4,
    int total = 4,
  }) async {
    final List<XFile> photos = <XFile>[];
    final AppStrings strings = _strings;
    final bool startCapture = await _askYesNo(
      title: strings.format(
        'step_title',
        <String, String>{'step': '$step', 'total': '$total'},
      ),
      message: strings.text('take_photos_question'),
      yes: strings.text('take_photos'),
      no: strings.text('skip_photos'),
    );
    if (!startCapture) {
      return photos;
    }
    while (photos.length < 10) {
      final XFile? shot = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 88,
      );
      if (shot != null) {
        photos.add(shot);
      }
      if (photos.length >= 10) {
        break;
      }
      final bool addMore = await _askYesNo(
        title: strings.format('photo_title', <String, String>{
          'current': '${photos.length}',
          'total': '10',
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
}
