// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageScanEntrypoints on _QrHomePageState {
  Future<void> _onScanTap() async {
    if (isScanActionLocked(
      adding: _adding,
      removing: _removing,
      printingItemId: _printingItemId,
      printingImage: _printingImage,
    )) {
      return;
    }
    final String? action = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) {
        final AppStrings strings = AppStrings.of(dialogContext);
        return Dialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  strings.text('scan_action_title'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: uiText,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  strings.text('scan_action_subtitle'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: uiMuted,
                  ),
                ),
                const SizedBox(height: 16),
                _ScanDialogActionButton(
                  label: strings.text('add'),
                  icon: Icons.add_box_rounded,
                  emphasized: true,
                  onPressed: () => Navigator.of(dialogContext).pop('add'),
                ),
                const SizedBox(height: 10),
                _ScanDialogActionButton(
                  label: strings.text('remove'),
                  icon: Icons.indeterminate_check_box_rounded,
                  onPressed: () => Navigator.of(dialogContext).pop('remove'),
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

    switch (parseScanActionChoice(action)) {
      case ScanActionChoice.add:
        await _onAddItem();
        break;
      case ScanActionChoice.remove:
        await _onRemoveItem();
        break;
      case ScanActionChoice.cancel:
        break;
    }
  }

  Future<void> _reloadList() async {
    await _loadInitialIntakes();
  }
}
