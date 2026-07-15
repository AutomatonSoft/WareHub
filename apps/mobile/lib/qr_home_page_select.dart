part of 'qr_home_page.dart';

class AppSelectOption<T> {
  const AppSelectOption({required this.value, required this.label});

  final T value;
  final String label;
}

class AppSelectField<T> extends StatelessWidget {
  const AppSelectField({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<AppSelectOption<T>> options;
  final ValueChanged<T>? onChanged;

  @override
  Widget build(BuildContext context) {
    final AppSelectOption<T>? selected = _selectedOption;
    final bool enabled = onChanged != null && options.isNotEmpty;
    final String selectedLabel = selected?.label ?? '';

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      value: selectedLabel,
      child: Opacity(
        opacity: enabled ? 1 : 0.55,
        child: Material(
          color: uiCardSoft,
          borderRadius: BorderRadius.circular(AuthRadii.md),
          child: InkWell(
            borderRadius: BorderRadius.circular(AuthRadii.md),
            onTap: enabled ? () => _openPicker(context) : null,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minHeight: AuthSpacing.inputHeight,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AuthSpacing.md,
                  vertical: 9,
                ),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AuthTextStyles.helper,
                          ),
                          const SizedBox(height: 3),
                          Text(
                            selectedLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AuthTextStyles.input,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: AuthColors.mutedForeground,
                      size: 22,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  AppSelectOption<T>? get _selectedOption {
    for (final AppSelectOption<T> option in options) {
      if (option.value == value) return option;
    }
    return options.isEmpty ? null : options.first;
  }

  Future<void> _openPicker(BuildContext context) async {
    final T? selected = await showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext sheetContext) {
        final double maxHeight = MediaQuery.sizeOf(sheetContext).height * 0.62;
        return ConstrainedBox(
          key: const Key('app-select-picker'),
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: Material(
            color: uiCard,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AuthRadii.xl),
            ),
            clipBehavior: Clip.antiAlias,
            child: SafeArea(
              key: const Key('app-select-safe-area'),
              top: false,
              maintainBottomViewPadding: true,
              minimum: const EdgeInsets.only(bottom: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const SizedBox(height: 10),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AuthColors.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 8, 10),
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AuthTextStyles.title.copyWith(fontSize: 20),
                          ),
                        ),
                        IconButton(
                          tooltip: MaterialLocalizations.of(sheetContext)
                              .closeButtonTooltip,
                          onPressed: () => Navigator.of(sheetContext).pop(),
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AuthColors.border),
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: options.length,
                      itemBuilder: (BuildContext context, int index) {
                        final AppSelectOption<T> option = options[index];
                        final bool isSelected = option.value == value;
                        return Semantics(
                          selected: isSelected,
                          button: true,
                          child: ListTile(
                            minTileHeight: 52,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 20,
                            ),
                            selected: isSelected,
                            selectedTileColor: uiBrandGreenSoft,
                            title: Text(
                              option.label,
                              style: AuthTextStyles.input.copyWith(
                                color: isSelected ? uiBrandGreen : uiText,
                                fontWeight: isSelected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                            trailing: isSelected
                                ? const Icon(
                                    Icons.check_rounded,
                                    color: uiBrandGreen,
                                  )
                                : null,
                            onTap: () =>
                                Navigator.of(sheetContext).pop(option.value),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
    if (selected != null && context.mounted) {
      onChanged?.call(selected);
    }
  }
}
