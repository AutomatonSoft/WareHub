// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageScanRemoveFlow on _QrHomePageState {
  List<IntakeData> _findActiveTargetsByWarehouseLocation(String location) {
    final String normalized = normalizeWarehouseLocation(location);
    final List<IntakeData> targets = _items
        .where((IntakeData item) =>
            !item.isRemoved &&
            normalizeWarehouseLocation(item.warehouseLocation) == normalized)
        .toList(growable: false);
    targets.sort((IntakeData a, IntakeData b) {
      final int byUnit = a.unitIndex.compareTo(b.unitIndex);
      if (byUnit != 0) {
        return byUnit;
      }
      return a.boxIndex.compareTo(b.boxIndex);
    });
    return targets;
  }

  Future<bool> _confirmRemoveByLocation({
    required String warehouseLocation,
    required List<IntakeData> targets,
  }) async {
    final List<List<IntakeData>> unitGroups = _splitIntoUnitGroups(targets);
    final List<IntakeData> oldestGroup =
        _pickOldestUnitGroupForRemoval(targets);
    if (oldestGroup.isEmpty) {
      return false;
    }
    final IntakeData representative = oldestGroup.first;
    final DateTime oldestDate = oldestGroup
        .map(_safeCreatedAt)
        .reduce((DateTime x, DateTime y) => x.isBefore(y) ? x : y);
    final String productLabel = representative.productKey.isEmpty
        ? _strings.text('na')
        : representative.productKey;
    final int unitCount = unitGroups.length;
    final int boxesToRemove = oldestGroup.length;
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) {
        final AppStrings strings = AppStrings.of(dialogContext);
        return AlertDialog(
          title: Text('${strings.text('remove')}: $warehouseLocation'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('${strings.text('kid')}: ${representative.kidNumber}'),
              Text('${strings.text('product_key')}: $productLabel'),
              Text(
                  '${strings.text('section_slot')}: ${warehouseSectionLabel(representative.section)}/${representative.slotNumber}'),
              Text('${strings.text('count')}: $unitCount'),
              Text('${strings.text('boxes')}: $boxesToRemove'),
              Text(strings.format(
                'oldest_item_date',
                <String, String>{'date': _formatDateTimeForUi(oldestDate)},
              )),
              if (unitCount > 1) Text(strings.text('remove_fifo_hint')),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(strings.text('cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(strings.text('remove')),
            ),
          ],
        );
      },
    );
    return confirmed ?? false;
  }

  Future<int> _deleteOldestIntakeByLocation({
    required String section,
    required int place,
  }) async {
    final Uri url = Uri.parse(
      '${_effectiveApiBase()}/services/kids/mark-out-of-stock/',
    );
    final Map<String, dynamic> body = {
      'place': '$place',
      'section': section,
    };
    String jsonString = jsonEncode(body);
    final http.Response response = await _authorizedRequest(
      'POST',
      url,
      headers: _authHeaders(json: true),
      body: jsonString,
    );
    if (response.statusCode == 401) {
      final MobileAuthRefreshStatus status =
          await _handleUnauthorizedAfterRefresh();
      if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
        throw const MobileAuthRefreshUnavailableException();
      }
      throw Exception(_strings.text('delete_intake_failed_unauthorized'));
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_strings.format(
        'delete_intake_failed_http',
        <String, String>{'code': '${response.statusCode}'},
      ));
    }
    if (response.body.trim().isEmpty) {
      return 1;
    }
    try {
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final dynamic removed = decoded['removed_count'];
        if (removed is int && removed > 0) {
          return removed;
        }
      }
    } catch (_) {
      // Ignore non-json response and fallback to 1.
    }
    return 1;
  }

  Future<void> _onRemoveItem() async {
    final String? source = await _askRemoveSource();
    switch (parseScanRemoveSourceChoice(source)) {
      case ScanRemoveSourceChoice.manual:
        await _onRemoveByManualLocation();
        return;
      case ScanRemoveSourceChoice.cancel:
        return;
      case ScanRemoveSourceChoice.qr:
        break;
    }
    await _onRemoveByQr();
  }

  Future<void> _onRemoveByQr() async {
    if (_adding || _removing) {
      return;
    }

    setState(() {
      _removing = true;
    });

    try {
      final String? scanned = await _scanRawQr();
      if (scanned == null || scanned.trim().isEmpty) {
        return;
      }

      final String? targetLocation =
          parseWarehouseLocationFromQrPayload(scanned);
      if (targetLocation == null) {
        _showMessage('${_strings.text('format_place')} 1', error: true);
        return;
      }

      String number = targetLocation.substring(1);

      final List<IntakeData> targets =
          _findActiveTargetsByWarehouseLocation(number);
      if (targets.isEmpty) {
        _showMessage(
          _strings.format(
            'no_active_products_for_location',
            <String, String>{'location': targetLocation},
          ),
          error: true,
        );
        return;
      }

      final bool confirmed = await _confirmRemoveByLocation(
        warehouseLocation: targetLocation,
        targets: targets,
      );
      if (!confirmed) {
        return;
      }
      final MapEntry<String, int>? parsed =
          parseWarehouseSectionAndSlot(targetLocation);
      if (parsed == null) {
        _showMessage('${_strings.text('format_place')} 2', error: true);
        return;
      }
      final int partsCount = await _deleteOldestIntakeByLocation(
        section: parsed.key,
        place: parsed.value,
      );
      await _reloadList();
      _showMessage(
        _strings.format('returned_marked', <String, String>{
          'count': '$partsCount',
        }),
      );
    } catch (error) {
      _showMessage(
        _messageForError(error, fallbackKey: 'action_failed_error'),
        error: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _removing = false;
        });
      }
    }
  }

  Future<void> _onRemoveByManualLocation() async {
    if (_adding || _removing) {
      return;
    }

    setState(() {
      _removing = true;
    });

    try {
      final String? section = await _askSectionSelection(
        title: _strings.format(
          'step_title',
          <String, String>{'step': '1', 'total': '2'},
        ),
      );
      if (section == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final String? slotCode = await _askRequiredText(
        title: _strings.format(
          'step_title',
          <String, String>{'step': '2', 'total': '2'},
        ),
        label: _strings.text('warehouse_place'),
        validator: (String value) {
          if (value.isEmpty) {
            return _strings.text('enter_place');
          }
          if (!RegExp(r'^[0-9]+[A-Za-z]*$').hasMatch(value)) {
            return _strings.text('format_place');
          }
          return null;
        },
        normalizer: (String value) => value.trim().toUpperCase(),
      );
      if (slotCode == null) {
        return;
      }

      final String targetLocation = buildWarehouseLocation(section, slotCode);
      final List<IntakeData> targets =
          _findActiveTargetsByWarehouseLocation(targetLocation);

      if (targets.isEmpty) {
        _showMessage(
          _strings.format(
            'no_active_products_for_location',
            <String, String>{'location': targetLocation},
          ),
          error: true,
        );
        return;
      }

      final bool confirmed = await _confirmRemoveByLocation(
        warehouseLocation: targetLocation,
        targets: targets,
      );
      if (!confirmed) {
        return;
      }
      final int? place = parseWarehouseSlotNumber(slotCode);
      if (place == null ||
          place < kWarehouseMinSlot ||
          place > kWarehouseMaxSlot) {
        _showMessage(_strings.text('format_place'), error: true);
        return;
      }
      final int removedCount = await _deleteOldestIntakeByLocation(
        section: section,
        place: place,
      );
      await _reloadList();

      _showMessage(
        _strings.format('returned_marked', <String, String>{
          'count': '$removedCount',
        }),
      );
    } catch (error) {
      _showMessage(
        _messageForError(error, fallbackKey: 'action_failed_error'),
        error: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _removing = false;
        });
      }
    }
  }
}
