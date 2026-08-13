// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

enum _ImagePrintSource {
  gallery,
  manual,
}

class _PrintPreviewActionButton extends StatelessWidget {
  const _PrintPreviewActionButton({
    this.child,
  });

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 116,
      height: 44,
      child: child,
    );
  }
}

class _ImageSourceActionButton extends StatelessWidget {
  const _ImageSourceActionButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AuthSpacing.buttonHeight,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: uiText,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          textStyle: _printerButtonTextStyle,
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(label),
        ),
      ),
    );
  }
}

// The niimbot_label_printer plugin only marks a pixel black when it is
// exactly opaque black (0xFF000000); it does no thresholding of its own. Any
// image with anti-aliased or continuous-tone pixels (photos, scaled bitmaps)
// must be dithered down to strict black/white first or it prints blank.
Uint8List _ditherToBlackWhite(Uint8List rgba, int width, int height) {
  final Uint8List out = Uint8List.fromList(rgba);
  final Float32List luminance = Float32List(width * height);
  for (int i = 0; i < width * height; i++) {
    final int o = i * 4;
    final double alpha = rgba[o + 3] / 255.0;
    final double r = rgba[o] * alpha + 255 * (1 - alpha);
    final double g = rgba[o + 1] * alpha + 255 * (1 - alpha);
    final double b = rgba[o + 2] * alpha + 255 * (1 - alpha);
    luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      final int i = y * width + x;
      final double oldValue = luminance[i];
      final bool isBlack = oldValue < 128;
      final double newValue = isBlack ? 0 : 255;
      final double error = oldValue - newValue;
      final int o = i * 4;
      out[o] = newValue.toInt();
      out[o + 1] = newValue.toInt();
      out[o + 2] = newValue.toInt();
      out[o + 3] = 255;

      void spread(int dx, int dy, double factor) {
        final int nx = x + dx;
        final int ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          return;
        }
        luminance[ny * width + nx] += error * factor;
      }

      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
  return out;
}

extension _QrHomePagePrintJobs on _QrHomePageState {
  Future<List<int>> _buildPrintBytes(ui.Image image) async {
    final ByteData? byteData =
        await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (byteData == null) {
      throw Exception('Unable to convert image to raw pixels.');
    }
    final Uint8List rgba = byteData.buffer.asUint8List();
    // PrintData.toMap() only unwraps Uint8List when its runtimeType is
    // exactly Uint8List, which the concrete native type never matches - a
    // Uint8List crosses the platform channel as a byte-array blob instead
    // of a List<Int>, and the native `as? List<Int>` cast then silently
    // yields null. Return a genuine growable List<int> to avoid that.
    return _ditherToBlackWhite(rgba, image.width, image.height).toList();
  }

  Future<_ImagePrintSource?> _showImageSourceDialog() async {
    return showDialog<_ImagePrintSource>(
      context: context,
      builder: (BuildContext context) {
        final AppStrings strings = _strings;
        return AlertDialog(
          backgroundColor: AuthColors.background,
          shape: _printerDialogShape(),
          title: Text(
            strings.text('print_image_source_title'),
            style: _printerDialogTitleStyle,
          ),
          content: SizedBox(
            width: _printerDialogWidth,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: _ImageSourceActionButton(
                        label: strings.text('gallery'),
                        onPressed: () => Navigator.of(context)
                            .pop(_ImagePrintSource.gallery),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _ImageSourceActionButton(
                        label: strings.text('manual'),
                        onPressed: () =>
                            Navigator.of(context).pop(_ImagePrintSource.manual),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _PrinterSecondaryButton(
                  label: strings.text('cancel'),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
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
              backgroundColor: AuthColors.background,
              shape: _printerDialogShape(),
              title: Text(dialogTitle, style: _printerDialogTitleStyle),
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
                SizedBox(
                  width: 280,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          _PrintPreviewActionButton(
                            child: _PrinterTextButton(
                              label: strings.text('prev'),
                              onPressed: index <= 0
                                  ? null
                                  : () {
                                      setStateDialog(() {
                                        index -= 1;
                                      });
                                    },
                            ),
                          ),
                          const Spacer(),
                          _PrintPreviewActionButton(
                            child: _PrinterTextButton(
                              label: strings.text('next'),
                              onPressed: index >= images.length - 1
                                  ? null
                                  : () {
                                      setStateDialog(() {
                                        index += 1;
                                      });
                                    },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          if (canPrint) ...<Widget>[
                            _PrinterPrimaryButton(
                              label: strings.text('print_now'),
                              onPressed: () => Navigator.of(context).pop(true),
                            ),
                            const SizedBox(height: 4),
                          ],
                          _PrinterSecondaryButton(
                            label: canPrint
                                ? strings.text('cancel')
                                : strings.text('close'),
                            onPressed: () => Navigator.of(context).pop(false),
                          ),
                        ],
                      ),
                    ],
                  ),
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
      final String basePayload = _buildLabelQrPayload(warehouseLocation);
      final String normalizedSection =
          normalizeWarehouseSection(sectionCode ?? '');
      final String payload = normalizedSection.isEmpty
          ? basePayload
          : '$normalizedSection$basePayload';
      final String mainCaption = payload;
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
        final List<int> bytes = await _buildPrintBytes(image);
        final int effectiveLabelType = _printLabelType;
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
    final List<int> bytes = await _buildPrintBytes(image);
    final int effectiveLabelType = _printLabelType;
    final PrintData printData = PrintData(
      data: bytes,
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
            backgroundColor: AuthColors.background,
            shape: _printerDialogShape(),
            title: Text(
              strings.text('print_image_title'),
              style: _printerDialogTitleStyle,
            ),
            content: SizedBox(
              width: 260,
              child: AspectRatio(
                aspectRatio: image.width / image.height,
                child: RawImage(image: image, fit: BoxFit.contain),
              ),
            ),
            actions: <Widget>[
              SizedBox(
                width: 260,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    _PrinterPrimaryButton(
                      label: strings.text('print'),
                      onPressed: () => Navigator.of(context).pop(true),
                    ),
                    const SizedBox(height: 4),
                    _PrinterSecondaryButton(
                      label: strings.text('cancel'),
                      onPressed: () => Navigator.of(context).pop(false),
                    ),
                  ],
                ),
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
}
