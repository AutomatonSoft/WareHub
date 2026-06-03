// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

enum _ImagePrintSource {
  gallery,
  manual,
  serializerTest,
}

extension _QrHomePagePrintJobs on _QrHomePageState {
  Future<_ImagePrintSource?> _showImageSourceDialog() async {
    return showDialog<_ImagePrintSource>(
      context: context,
      builder: (BuildContext context) {
        final AppStrings strings = _strings;
        return AlertDialog(
          title: Text(strings.text('print_image_source_title')),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(strings.text('cancel')),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).pop(_ImagePrintSource.gallery),
              child: Text(strings.text('gallery')),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).pop(_ImagePrintSource.manual),
              child: Text(strings.text('manual')),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).pop(_ImagePrintSource.serializerTest),
              child: const Text('Serializer x4'),
            ),
          ],
        );
      },
    );
  }

  Future<ui.Image> _buildManualTestPatternImage() async {
    final int width = _printWidthPx > 0 ? _printWidthPx : 384;
    final int height = _printHeightPx > 0 ? _printHeightPx : 640;
    final ui.PictureRecorder recorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(recorder);
    final Rect full = Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble());
    canvas.drawRect(full, Paint()..color = Colors.white);
    final double side = (width < height ? width : height) * 0.65;
    final Rect square = Rect.fromCenter(
      center: Offset(width / 2, height / 2),
      width: side,
      height: side,
    );
    canvas.drawRect(square, Paint()..color = Colors.black);
    final ui.Picture picture = recorder.endRecording();
    return picture.toImage(width, height);
  }

  Future<bool> _showPrintPreviewDialog(
    List<ui.Image> images, {
    String? title,
    bool canPrint = true,
  }) async {
    int index = 0;
    final bool? decision = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        final AppStrings strings = _strings;
        final String dialogTitle = title ?? strings.text('print_preview');
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            final ui.Image current = images[index];
            final double maxDialogHeight =
                MediaQuery.of(context).size.height * 0.72;
            return AlertDialog(
              title: Text(dialogTitle),
              content: SizedBox(
                width: 280,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxDialogHeight),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Flexible(
                        child: AspectRatio(
                          aspectRatio: current.width / current.height,
                          child: RawImage(image: current, fit: BoxFit.contain),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('${index + 1}/${images.length}'),
                    ],
                  ),
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: index <= 0
                      ? null
                      : () {
                          setStateDialog(() {
                            index -= 1;
                          });
                        },
                  child: Text(strings.text('prev')),
                ),
                TextButton(
                  onPressed: index >= images.length - 1
                      ? null
                      : () {
                          setStateDialog(() {
                            index += 1;
                          });
                        },
                  child: Text(strings.text('next')),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: Text(
                    canPrint ? strings.text('cancel') : strings.text('close'),
                  ),
                ),
                if (canPrint)
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: Text(strings.text('print_now')),
                  ),
              ],
            );
          },
        );
      },
    );
    return decision ?? false;
  }

  Future<void> _printLabelForAddedItem(
    String warehouseLocation, {
    int quantity = 1,
    int unitIndex = 1,
    int? totalParts,
    String? sectionCode,
    int? slotNumber,
  }) async {
    try {
      final AppStrings strings = _strings;
      final String payload = _buildLabelQrPayload(warehouseLocation);
      final String mainCaption =
          warehouseLocation.trim().toUpperCase().replaceAll(' ', '');
      final int partsTotal = totalParts ?? quantity;
      final List<ui.Image> images = <ui.Image>[];
      for (int i = 1; i <= quantity; i++) {
        final String? partsCaption = quantity > 1
            ? '$i/$quantity'
            : (partsTotal > 1 ? '$unitIndex/$partsTotal' : null);
        final ui.Image image = await _buildLabelImage(
          payload,
          mainCaption: mainCaption,
          partsCaption: partsCaption,
        );
        images.add(image);
      }

      final bool printConfirmed = await _showPrintPreviewDialog(
        images,
        title: quantity == 1
            ? strings.text('label_preview')
            : strings.format(
                'labels_preview',
                <String, String>{'count': '$quantity'},
              ),
        canPrint: !_previewOnlyMode,
      );

      if (_previewOnlyMode) {
        _showMessage(strings.text('preview_only_on'));
        return;
      }
      if (!printConfirmed) {
        _showMessage(strings.text('print_canceled'));
        return;
      }

      await _ensureNimbotConnection();
      for (int i = 0; i < images.length; i++) {
        final ui.Image image = images[i];
        final ByteData? byteData =
            await image.toByteData(format: ui.ImageByteFormat.png);
        if (byteData == null) {
          throw Exception('Unable to build label image.');
        }
        final List<int> bytes = byteData.buffer.asUint8List().toList();
        final int effectiveLabelType =
            _printLabelType == 0 ? 1 : _printLabelType;
        final int effectiveHeight = _printHeightPx;
        final int effectiveDensity = _printDensity;

        final PrintData printData = PrintData(
          data: bytes,
          width: _printWidthPx,
          height: effectiveHeight,
          rotate: false,
          invertColor: false,
          density: effectiveDensity,
          labelType: effectiveLabelType,
        );
        await _sendPrintData(printData);
        if (i < images.length - 1 && _printInterLabelDelayMs > 0) {
          await Future<void>.delayed(
            Duration(milliseconds: _printInterLabelDelayMs),
          );
        }
      }
      _showMessage(
        strings.format('printed_labels', <String, String>{
          'count': '$quantity',
        }),
      );
    } catch (error) {
      final String message = 'Print failed: $error';
      if (message.toLowerCase().contains('permission')) {
        _showPermissionSettingsMessage(message);
        return;
      }
      _showMessage(message, error: true);
    }
  }

  Future<void> _onPrintItem(IntakeData item) async {
    if (_adding || _removing || _printingItemId != null) {
      return;
    }

    setState(() {
      _printingItemId = item.id;
    });

    try {
      await _printLabelForAddedItem(
        item.warehouseLocation,
        quantity: item.boxTotal < 1 ? 1 : item.boxTotal,
        totalParts: item.boxTotal,
        unitIndex: item.unitIndex,
        sectionCode: item.section,
        slotNumber: item.slotNumber,
      );
    } finally {
      if (mounted) {
        setState(() {
          _printingItemId = null;
        });
      }
    }
  }

  Future<ui.Image> _decodeImageFile(File file) async {
    final Uint8List bytes = await file.readAsBytes();
    final Completer<ui.Image> completer = Completer<ui.Image>();
    ui.decodeImageFromList(bytes, (ui.Image img) {
      completer.complete(img);
    });
    return completer.future;
  }

  Future<void> _printUiImage(ui.Image image) async {
    final bool printConfirmed = await _showPrintPreviewDialog(
      <ui.Image>[image],
      title: _strings.text('print_preview'),
      canPrint: !_previewOnlyMode,
    );
    if (_previewOnlyMode) {
      _showMessage(_strings.text('preview_only_on'));
      return;
    }
    if (!printConfirmed) {
      _showMessage(_strings.text('print_canceled'));
      return;
    }
    await _ensureNimbotConnection();
    final ByteData? byteData =
        await image.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) {
      throw Exception('Unable to convert selected image.');
    }
    final int effectiveLabelType = _printLabelType == 0 ? 1 : _printLabelType;
    final PrintData printData = PrintData(
      data: byteData.buffer.asUint8List().toList(),
      width: _printWidthPx,
      height: _printHeightPx,
      rotate: false,
      invertColor: false,
      density: _printDensity,
      labelType: effectiveLabelType,
    );
    await _sendPrintData(printData);
  }

  Future<void> _onPickAndPrintImage() async {
    if (_adding || _removing || _printingItemId != null || _printingImage) {
      return;
    }
    setState(() {
      _printingImage = true;
    });
    try {
      final _ImagePrintSource? source = await _showImageSourceDialog();
      if (source == null) {
        return;
      }
      if (source == _ImagePrintSource.serializerTest) {
        await _runSerializerPackingModeTest();
        return;
      }

      ui.Image image;
      if (source == _ImagePrintSource.gallery) {
        final XFile? picked =
            await _imagePicker.pickImage(source: ImageSource.gallery);
        if (picked == null) {
          return;
        }
        final File file = File(picked.path);
        final ui.Image original = await _decodeImageFile(file);
        image = await _fitImageToLabelCanvas(original);
      } else {
        image = await _buildManualTestPatternImage();
      }
      if (!mounted) {
        return;
      }

      final bool? confirmed = await showDialog<bool>(
        context: context,
        builder: (BuildContext context) {
          final AppStrings strings = AppStrings.of(context);
          return AlertDialog(
            title: Text(strings.text('print_image_title')),
            content: SizedBox(
              width: 260,
              child: AspectRatio(
                aspectRatio: image.width / image.height,
                child: RawImage(image: image, fit: BoxFit.contain),
              ),
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: Text(strings.text('cancel')),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(strings.text('print')),
              ),
            ],
          );
        },
      );

      if (confirmed != true) {
        return;
      }

      await _printUiImage(image);
      _showMessage(_strings.text('image_printed'));
    } catch (error) {
      final String message = 'Print failed: $error';
      if (message.toLowerCase().contains('permission')) {
        _showPermissionSettingsMessage(message);
      } else {
        _showMessage(message, error: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _printingImage = false;
        });
      }
    }
  }

  Future<void> _runSerializerPackingModeTest() async {
    await _ensureNimbotConnection();
    final List<Map<String, dynamic>> modes = <Map<String, dynamic>>[
      <String, dynamic>{'bitOrder': 'MSB', 'invertPackedBits': false},
      <String, dynamic>{'bitOrder': 'MSB', 'invertPackedBits': true},
      <String, dynamic>{'bitOrder': 'LSB', 'invertPackedBits': false},
      <String, dynamic>{'bitOrder': 'LSB', 'invertPackedBits': true},
    ];

    for (int i = 0; i < modes.length; i++) {
      final Map<String, dynamic> mode = modes[i];
      final String bitOrder = mode['bitOrder'] as String;
      final bool invertPackedBits = mode['invertPackedBits'] as bool;
      _showMessage(
        'Serializer test ${i + 1}/4: bitOrder=$bitOrder invertPackedBits=$invertPackedBits',
      );

      final PrinterOperationResult result =
          await _printer.debugPrintTestPattern(
        labelType: _printLabelType == 0 ? 1 : _printLabelType,
        density: _printDensity,
        bitOrder: bitOrder,
        invertPackedBits: invertPackedBits,
      );
      if (!result.ok) {
        throw Exception(
          'Serializer test failed for $bitOrder/$invertPackedBits: ${result.code} ${result.message}',
        );
      }
      if (i < modes.length - 1) {
        await Future<void>.delayed(const Duration(seconds: 2));
      }
    }
    _showMessage(
      'Serializer test done: check paper + logs (rasterDebug, roundtripMismatchCount).',
    );
  }
}
