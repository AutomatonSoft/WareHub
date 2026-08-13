// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

class _PlacementInput {
  const _PlacementInput({
    required this.placementStrategy,
    this.warehouseLocation,
    this.existingQrCodeForQuantity,
  });

  final String placementStrategy;
  final String? warehouseLocation;
  final String? existingQrCodeForQuantity;
}

enum _ExistingProductDecision {
  addToExisting,
  createNew,
  cancel,
}

extension _QrHomePageScanHelpers on _QrHomePageState {
  String _unitGroupKey(IntakeData item) {
    return <String>[
      item.qrCode.trim().toUpperCase(),
      item.kidNumber.trim().toUpperCase(),
      item.productKey.trim().toUpperCase(),
      item.unitIndex.toString(),
      item.isBWare ? '1' : '0',
    ].join('|');
  }

  DateTime _safeCreatedAt(IntakeData item) {
    return DateTime.tryParse(item.createdAt) ??
        DateTime.fromMillisecondsSinceEpoch(0);
  }

  String _formatDateTimeForUi(DateTime value) {
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(value.day)}.${two(value.month)}.${value.year} '
        '${two(value.hour)}:${two(value.minute)}';
  }

  List<List<IntakeData>> _splitIntoUnitGroups(List<IntakeData> items) {
    final Map<String, List<IntakeData>> groups = <String, List<IntakeData>>{};
    for (final IntakeData item in items) {
      groups.putIfAbsent(_unitGroupKey(item), () => <IntakeData>[]).add(item);
    }
    return groups.values.toList(growable: false);
  }

  List<IntakeData> _pickOldestUnitGroupForRemoval(List<IntakeData> targets) {
    final List<List<IntakeData>> groups = _splitIntoUnitGroups(targets);
    if (groups.isEmpty) {
      return const <IntakeData>[];
    }
    groups.sort((List<IntakeData> a, List<IntakeData> b) {
      final DateTime oldestA = a
          .map(_safeCreatedAt)
          .reduce((DateTime x, DateTime y) => x.isBefore(y) ? x : y);
      final DateTime oldestB = b
          .map(_safeCreatedAt)
          .reduce((DateTime x, DateTime y) => x.isBefore(y) ? x : y);
      return oldestA.compareTo(oldestB);
    });
    final List<IntakeData> picked = groups.first;
    picked
        .sort((IntakeData a, IntakeData b) => a.boxIndex.compareTo(b.boxIndex));
    return picked;
  }

  List<IntakeData> _findActiveWithSameIdentity({
    required String kidNumber,
    String? productKey,
    String? orderId,
  }) {
    final String normalizedKid = kidNumber.trim().toUpperCase();
    final String normalizedProductKey = (productKey ?? '').trim().toUpperCase();
    final String normalizedOrderId = (orderId ?? '').trim().toUpperCase();
    final bool canMatchByKid =
        normalizedKid.isNotEmpty && normalizedKid != 'NO-KID';
    final bool canMatchByProductKey = normalizedProductKey.isNotEmpty;
    final bool canMatchByOrderId = normalizedOrderId.isNotEmpty;

    if (!canMatchByKid && !canMatchByProductKey && !canMatchByOrderId) {
      return const <IntakeData>[];
    }

    return _items.where((IntakeData item) {
      if (!item.isActiveEffective) {
        return false;
      }
      final String itemProductKey = item.productKey.trim().toUpperCase();
      if (canMatchByProductKey &&
          itemProductKey.isNotEmpty &&
          itemProductKey == normalizedProductKey) {
        return true;
      }
      if (canMatchByOrderId) {
        final String itemOrderId =
            (parseQrData(item.qrCode).orderId ?? '').trim().toUpperCase();
        if (itemOrderId.isNotEmpty && itemOrderId == normalizedOrderId) {
          return true;
        }
      }
      if (!canMatchByKid) {
        return false;
      }
      return item.kidNumber.trim().toUpperCase() == normalizedKid;
    }).toList(growable: false);
  }

  Future<_ExistingProductDecision> _askExistingProductDecision({
    required List<IntakeData> existing,
    required String targetWarehouseLocation,
    bool occupiedSlotCase = false,
  }) async {
    final Set<String> locations = existing
        .map((IntakeData item) => item.warehouseLocation.trim().toUpperCase())
        .where((String value) => value.isNotEmpty)
        .toSet();
    final String locationText = (locations.toList()..sort()).join(', ');
    final _ExistingProductDecision? result =
        await showDialog<_ExistingProductDecision>(
      context: context,
      builder: (BuildContext dialogContext) {
        final AppStrings strings = AppStrings.of(dialogContext);
        final String titleKey = occupiedSlotCase
            ? 'existing_product_slot_taken_title'
            : 'existing_product_found_title';
        final String body = occupiedSlotCase
            ? strings.format(
                'existing_product_slot_taken_body',
                <String, String>{'slot': targetWarehouseLocation},
              )
            : strings.format(
                'existing_product_found_body',
                <String, String>{
                  'locations': locationText,
                  'target': targetWarehouseLocation,
                },
              );
        return AlertDialog(
          title: Text(strings.text(titleKey)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(body),
              const SizedBox(height: 24),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _PrinterPrimaryButton(
                      label: strings.text('existing_product_create_new'),
                      onPressed: () => Navigator.of(dialogContext)
                          .pop(_ExistingProductDecision.createNew),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _PrinterPrimaryButton(
                      label: strings.text('existing_product_add_quantity'),
                      onPressed: () => Navigator.of(dialogContext)
                          .pop(_ExistingProductDecision.addToExisting),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _PrinterSecondaryButton(
                label: strings.text('cancel'),
                onPressed: () => Navigator.of(dialogContext)
                    .pop(_ExistingProductDecision.cancel),
              ),
            ],
          ),
          shape: _printerDialogShape(),
          backgroundColor: uiCard,
          surfaceTintColor: Colors.transparent,
        );
      },
    );
    return result ?? _ExistingProductDecision.cancel;
  }

  Future<bool> _confirmExistingOrNewFlow({
    required String kidNumber,
    String? productKey,
    String? orderId,
    required String targetWarehouseLocation,
  }) async {
    final List<IntakeData> existing = _findActiveWithSameIdentity(
      kidNumber: kidNumber,
      productKey: productKey,
      orderId: orderId,
    );
    if (existing.isEmpty) {
      return true;
    }
    final _ExistingProductDecision decision = await _askExistingProductDecision(
      existing: existing,
      targetWarehouseLocation: targetWarehouseLocation,
    );
    return decision != _ExistingProductDecision.cancel;
  }

  Future<_PlacementInput?> _askPlacementInput({
    required int step,
    required int total,
  }) async {
    final String? slotCode = await _askRequiredText(
      title: _strings.format(
        'step_title',
        <String, String>{'step': '$step', 'total': '$total'},
      ),
      label: _strings.text('warehouse_place'),
      validator: (String value) {
        if (value.isEmpty) {
          return null;
        }
        if (!RegExp(r'^[0-9]+[A-Za-z]*$').hasMatch(value)) {
          return _strings.text('format_place') + ' 3';
        }
        final int? slot = parseWarehouseSlotNumber(value);
        if (slot == null ||
            slot < kWarehouseMinSlot ||
            slot > kWarehouseMaxSlot) {
          return _strings.text('format_place') + ' 4';
        }
        return null;
      },
      normalizer: (String value) => value.trim().toUpperCase(),
    );
    if (slotCode == null) {
      return null;
    }
    if (slotCode.isEmpty) {
      final String? nextSlotCode = findNextFreeWarehouseSlotCode(
        _items,
        minSlot: kWarehouseMinSlot,
        maxSlot: kWarehouseMaxSlot,
      );
      if (nextSlotCode == null) {
        _showMessage(
            'No free warehouse slots in pool ($kWarehouseMinSlot..$kWarehouseMaxSlot).',
            error: true);
        return null;
      }
      return _PlacementInput(
        placementStrategy: 'manual',
        warehouseLocation: normalizeWarehousePlace(nextSlotCode),
      );
    }

    final String targetLocation = normalizeWarehousePlace(slotCode);
    if (isWarehousePlaceOccupied(_items, targetLocation)) {
      final List<IntakeData> existingAtLocation = _items
          .where((IntakeData item) =>
              item.isActiveEffective &&
              normalizeWarehousePlace(item.warehouseLocation) == targetLocation)
          .toList(growable: false);
      final _ExistingProductDecision decision =
          await _askExistingProductDecision(
        existing: existingAtLocation,
        targetWarehouseLocation: targetLocation,
        occupiedSlotCase: true,
      );
      if (decision == _ExistingProductDecision.cancel) {
        return null;
      }
      if (decision == _ExistingProductDecision.createNew) {
        return _askPlacementInput(step: step, total: total);
      }
      final IntakeData? representative = existingAtLocation.isNotEmpty
          ? (existingAtLocation
                ..sort((IntakeData a, IntakeData b) {
                  return DateTime.parse(b.createdAt)
                      .compareTo(DateTime.parse(a.createdAt));
                }))
              .first
          : null;
      return _PlacementInput(
        placementStrategy: 'existing',
        existingQrCodeForQuantity: representative?.qrCode,
      );
    }

    return _PlacementInput(
      placementStrategy: 'manual',
      warehouseLocation: targetLocation,
    );
  }
}
