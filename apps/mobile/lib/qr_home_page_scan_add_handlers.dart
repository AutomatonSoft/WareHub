// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageScanAddHandlers on _QrHomePageState {
  Future<void> _onAddItem() async {
    final String? source = await _askAddSource();
    switch (parseScanAddSourceChoice(source)) {
      case ScanAddSourceChoice.empty:
        await _onAddEmptyItem();
        return;
      case ScanAddSourceChoice.kid:
        await _onAddByKidNumber();
        return;
      case ScanAddSourceChoice.cancel:
        return;
      case ScanAddSourceChoice.qr:
        break;
    }
    await _onAddByQr();
  }

  Future<void> _onAddByQr() async {
    if (_adding || _removing) {
      return;
    }

    final AppStrings strings = _strings;
    final String? scanned = await _scanRawQr();
    if (scanned == null || scanned.trim().isEmpty) {
      return;
    }

    setState(() {
      _adding = true;
    });

    try {
      final ParsedQrData parsed = parseQrData(scanned.trim());
      final String? kidNumber = _resolveKidNumber(parsed);
      if (kidNumber == null) {
        _showMessage(strings.text('kid_not_found'), error: true);
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final int? boxTotal = await _askRequiredInt(
        title: strings.format(
          'step_title',
          <String, String>{'step': '1', 'total': '7'},
        ),
        label: strings.text('number_of_boxes'),
        initialValue: '1',
        minValue: 1,
      );
      if (boxTotal == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final String? section = await _askSectionSelection(
        title: strings.format(
          'step_title',
          <String, String>{'step': '2', 'total': '8'},
        ),
      );
      if (section == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final _PlacementInput? placementInput = await _askPlacementInput(
        section: section,
        step: 3,
        total: 8,
      );
      if (placementInput == null) {
        return;
      }
      final String? plannedLocation = placementInput.warehouseLocation;
      if (plannedLocation == null || plannedLocation.trim().isEmpty) {
        return;
      }
      final bool proceed = await _confirmExistingOrNewFlow(
        kidNumber: kidNumber,
        orderId: parsed.orderId,
        targetWarehouseLocation: plannedLocation,
      );
      if (!proceed) {
        return;
      }

      final _AddFlowData? addFlow = await _collectAddFlowData();
      if (addFlow == null) {
        return;
      }
      final IntakeData created = await _createIntake(
        parsed: parsed,
        productColor: addFlow.color,
        isBWare: addFlow.isBWare,
        bWareComment: addFlow.bWareComment,
        categoryMain: addFlow.category.main,
        categorySub: addFlow.category.sub,
        warehouseLocation: placementInput.warehouseLocation,
        boxTotal: boxTotal,
        placementStrategy: placementInput.placementStrategy,
      );
      await _finalizeAddedIntake(created, addFlow.photos);
    } catch (error) {
      _showMessage('$error', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _adding = false;
        });
      }
    }
  }

  Future<void> _onAddByKidNumber() async {
    if (_adding || _removing) {
      return;
    }
    final AppStrings strings = _strings;
    final String? kid = await _askRequiredText(
      title: strings.text('scan_source_title'),
      label: strings.text('kid_number'),
      validator: (String value) {
        if (value.trim().isEmpty) {
          return strings.text('kid_required');
        }
        return null;
      },
      normalizer: (String value) => value.trim().toUpperCase(),
    );
    if (kid == null || kid.trim().isEmpty) {
      return;
    }

    final ParsedQrData parsed = ParsedQrData(
      raw: 'KID-$kid',
      kidNumber: kid,
      kidNumber2: null,
      orderId: null,
    );

    setState(() {
      _adding = true;
    });

    try {
      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final int? boxTotal = await _askRequiredInt(
        title: strings.format(
          'step_title',
          <String, String>{'step': '1', 'total': '7'},
        ),
        label: strings.text('number_of_boxes'),
        initialValue: '1',
        minValue: 1,
      );
      if (boxTotal == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final String? section = await _askSectionSelection(
        title: strings.format(
          'step_title',
          <String, String>{'step': '2', 'total': '8'},
        ),
      );
      if (section == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final _PlacementInput? placementInput = await _askPlacementInput(
        section: section,
        step: 3,
        total: 8,
      );
      if (placementInput == null) {
        return;
      }
      final String? plannedLocation = placementInput.warehouseLocation;
      if (plannedLocation == null || plannedLocation.trim().isEmpty) {
        return;
      }
      final bool proceed = await _confirmExistingOrNewFlow(
        kidNumber: kid,
        targetWarehouseLocation: plannedLocation,
      );
      if (!proceed) {
        return;
      }

      final _AddFlowData? addFlow = await _collectAddFlowData();
      if (addFlow == null) {
        return;
      }
      final IntakeData created = await _createIntake(
        parsed: parsed,
        productColor: addFlow.color,
        isBWare: addFlow.isBWare,
        bWareComment: addFlow.bWareComment,
        categoryMain: addFlow.category.main,
        categorySub: addFlow.category.sub,
        warehouseLocation: placementInput.warehouseLocation,
        boxTotal: boxTotal,
        placementStrategy: placementInput.placementStrategy,
      );
      await _finalizeAddedIntake(created, addFlow.photos);
    } catch (error) {
      _showMessage('$error', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _adding = false;
        });
      }
    }
  }

  Future<void> _onAddEmptyItem() async {
    if (_adding || _removing) {
      return;
    }

    final AppStrings strings = _strings;
    setState(() {
      _adding = true;
    });

    try {
      final int? boxTotal = await _askRequiredInt(
        title: strings.format(
          'step_title',
          <String, String>{'step': '1', 'total': '7'},
        ),
        label: strings.text('number_of_boxes'),
        initialValue: '1',
        minValue: 1,
      );
      if (boxTotal == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final String? section = await _askSectionSelection(
        title: strings.format(
          'step_title',
          <String, String>{'step': '2', 'total': '8'},
        ),
      );
      if (section == null) {
        return;
      }

      await _stabilizeUiAfterRouteTransition();
      if (!mounted) {
        return;
      }

      final _PlacementInput? placementInput = await _askPlacementInput(
        section: section,
        step: 3,
        total: 8,
      );
      if (placementInput == null) {
        return;
      }
      final String? plannedLocation = placementInput.warehouseLocation;
      if (plannedLocation == null || plannedLocation.trim().isEmpty) {
        return;
      }
      final bool proceed = await _confirmExistingOrNewFlow(
        kidNumber: 'NO-KID',
        targetWarehouseLocation: plannedLocation,
      );
      if (!proceed) {
        return;
      }

      final _AddFlowData? addFlow = await _collectAddFlowData();
      if (addFlow == null) {
        return;
      }
      final String rawQr =
          (placementInput.existingQrCodeForQuantity ?? '').trim().isNotEmpty
              ? placementInput.existingQrCodeForQuantity!.trim()
              : 'EMPTY-${DateTime.now().millisecondsSinceEpoch}';
      final IntakeData created = await _createIntake(
        rawQrCode: rawQr,
        kidNumberOverride: 'NO-KID',
        productColor: addFlow.color,
        isBWare: addFlow.isBWare,
        bWareComment: addFlow.bWareComment,
        categoryMain: addFlow.category.main,
        categorySub: addFlow.category.sub,
        warehouseLocation: placementInput.warehouseLocation,
        boxTotal: boxTotal,
        placementStrategy: placementInput.placementStrategy,
      );
      await _finalizeAddedIntake(created, addFlow.photos);
    } catch (error) {
      _showMessage('$error', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _adding = false;
        });
      }
    }
  }

}
