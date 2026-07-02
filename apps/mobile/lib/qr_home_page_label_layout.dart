// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

enum _LabelLayoutElement {
  qr,
  mainText,
  partsText,
}

extension _QrHomePageLabelLayout on _QrHomePageState {
  Future<void> _saveLabelLayoutSettings() async {
    await _saveLabelLayoutSettingsLocal();
    await _pushLabelLayoutToServer();
  }

  Future<void> _saveLabelLayoutSettingsLocal() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('label_qr_scale', _labelQrScale);
    await prefs.setDouble('label_qr_offset_x', _labelQrOffsetX);
    await prefs.setDouble('label_qr_offset_y', _labelQrOffsetY);
    await prefs.setDouble('label_main_scale', _labelMainScale);
    await prefs.setDouble('label_main_offset_x', _labelMainOffsetX);
    await prefs.setDouble('label_main_offset_y', _labelMainOffsetY);
    await prefs.setDouble('label_parts_scale', _labelPartsScale);
    await prefs.setDouble('label_parts_offset_x', _labelPartsOffsetX);
    await prefs.setDouble('label_parts_offset_y', _labelPartsOffsetY);
  }

  Future<void> _syncLabelLayoutFromServer() async {
    try {
      final Uri url = Uri.parse('${_effectiveApiBase()}/label-layout');
      final http.Response response = await _authorizedRequest('GET', url);
      if (response.statusCode == 401) {
        final MobileAuthRefreshStatus status =
            await _handleUnauthorizedAfterRefresh();
        if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
          throw const MobileAuthRefreshUnavailableException();
        }
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return;
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return;
      }
      final double qrScale = _asDouble(decoded['qr_scale'], _labelQrScale);
      final double qrOffsetX =
          _asDouble(decoded['qr_offset_x'], _labelQrOffsetX);
      final double qrOffsetY =
          _asDouble(decoded['qr_offset_y'], _labelQrOffsetY);
      final double mainScale =
          _asDouble(decoded['main_scale'], _labelMainScale);
      final double mainOffsetX =
          _asDouble(decoded['main_offset_x'], _labelMainOffsetX);
      final double mainOffsetY =
          _asDouble(decoded['main_offset_y'], _labelMainOffsetY);
      final double partsScale =
          _asDouble(decoded['parts_scale'], _labelPartsScale);
      final double partsOffsetX =
          _asDouble(decoded['parts_offset_x'], _labelPartsOffsetX);
      final double partsOffsetY =
          _asDouble(decoded['parts_offset_y'], _labelPartsOffsetY);

      if (!mounted) {
        return;
      }
      setState(() {
        _labelQrScale = qrScale;
        _labelQrOffsetX = qrOffsetX;
        _labelQrOffsetY = qrOffsetY;
        _labelMainScale = mainScale;
        _labelMainOffsetX = mainOffsetX;
        _labelMainOffsetY = mainOffsetY;
        _labelPartsScale = partsScale;
        _labelPartsOffsetX = partsOffsetX;
        _labelPartsOffsetY = partsOffsetY;
      });
      await _saveLabelLayoutSettingsLocal();
    } catch (_) {
      // Keep local settings on network/parse errors.
    }
  }

  Future<void> _pushLabelLayoutToServer() async {
    final Uri url = Uri.parse('${_effectiveApiBase()}/label-layout');
    final http.Response response = await _authorizedRequest(
      'PUT',
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(_labelLayoutPayload()),
    );
    if (response.statusCode == 401) {
      final MobileAuthRefreshStatus status =
          await _handleUnauthorizedAfterRefresh();
      if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
        throw const MobileAuthRefreshUnavailableException();
      }
      throw Exception('Unauthorized');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to save global label layout');
    }
  }

  Map<String, double> _labelLayoutPayload() {
    return <String, double>{
      'qr_scale': _labelQrScale,
      'qr_offset_x': _labelQrOffsetX,
      'qr_offset_y': _labelQrOffsetY,
      'main_scale': _labelMainScale,
      'main_offset_x': _labelMainOffsetX,
      'main_offset_y': _labelMainOffsetY,
      'parts_scale': _labelPartsScale,
      'parts_offset_x': _labelPartsOffsetX,
      'parts_offset_y': _labelPartsOffsetY,
    };
  }

  double _asDouble(dynamic value, double fallback) {
    if (value is num) {
      return value.toDouble();
    }
    return fallback;
  }

  Future<void> _openLabelLayoutEditorDialog() async {
    double qrScale = _labelQrScale;
    double qrOffsetX = _labelQrOffsetX;
    double qrOffsetY = _labelQrOffsetY;
    double mainScale = _labelMainScale;
    double mainOffsetX = _labelMainOffsetX;
    double mainOffsetY = _labelMainOffsetY;
    double partsScale = _labelPartsScale;
    double partsOffsetX = _labelPartsOffsetX;
    double partsOffsetY = _labelPartsOffsetY;
    _LabelLayoutElement selected = _LabelLayoutElement.qr;

    double clampScale(
      _LabelLayoutElement element,
      double value,
    ) {
      switch (element) {
        case _LabelLayoutElement.qr:
          return value.clamp(0.50, 0.95).toDouble();
        case _LabelLayoutElement.mainText:
        case _LabelLayoutElement.partsText:
          return value.clamp(0.70, 1.80).toDouble();
      }
    }

    double clampOffsetX(double value) {
      final double max = _printWidthPx * 0.45;
      return value.clamp(-max, max).toDouble();
    }

    double clampOffsetY(double value) {
      final double max = _printHeightPx * 0.45;
      return value.clamp(-max, max).toDouble();
    }

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            final AppStrings strings = AppStrings.of(dialogContext);
            const double previewW = 220;
            final double previewH = previewW * (_printHeightPx / _printWidthPx);

            void updateScale(double delta) {
              setStateDialog(() {
                switch (selected) {
                  case _LabelLayoutElement.qr:
                    qrScale = clampScale(selected, qrScale + delta);
                    break;
                  case _LabelLayoutElement.mainText:
                    mainScale = clampScale(selected, mainScale + delta);
                    break;
                  case _LabelLayoutElement.partsText:
                    partsScale = clampScale(selected, partsScale + delta);
                    break;
                }
              });
            }

            void moveSelected(double dx, double dy) {
              setStateDialog(() {
                switch (selected) {
                  case _LabelLayoutElement.qr:
                    qrOffsetX = clampOffsetX(qrOffsetX + dx);
                    qrOffsetY = clampOffsetY(qrOffsetY + dy);
                    break;
                  case _LabelLayoutElement.mainText:
                    mainOffsetX = clampOffsetX(mainOffsetX + dx);
                    mainOffsetY = clampOffsetY(mainOffsetY + dy);
                    break;
                  case _LabelLayoutElement.partsText:
                    partsOffsetX = clampOffsetX(partsOffsetX + dx);
                    partsOffsetY = clampOffsetY(partsOffsetY + dy);
                    break;
                }
              });
            }

            return AlertDialog(
              title: const Text('Label layout'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Center(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          border: Border.all(color: uiBorder),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: SizedBox(
                          width: previewW,
                          height: previewH,
                          child: CustomPaint(
                            painter: _LabelLayoutPreviewPainter(
                              printWidth: _printWidthPx.toDouble(),
                              printHeight: _printHeightPx.toDouble(),
                              qrScale: qrScale,
                              qrOffsetX: qrOffsetX,
                              qrOffsetY: qrOffsetY,
                              mainScale: mainScale,
                              mainOffsetX: mainOffsetX,
                              mainOffsetY: mainOffsetY,
                              partsScale: partsScale,
                              partsOffsetX: partsOffsetX,
                              partsOffsetY: partsOffsetY,
                              selected: selected,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        ChoiceChip(
                          label: const Text('QR'),
                          selected: selected == _LabelLayoutElement.qr,
                          onSelected: (_) {
                            setStateDialog(() {
                              selected = _LabelLayoutElement.qr;
                            });
                          },
                        ),
                        ChoiceChip(
                          label: const Text('Main'),
                          selected: selected == _LabelLayoutElement.mainText,
                          onSelected: (_) {
                            setStateDialog(() {
                              selected = _LabelLayoutElement.mainText;
                            });
                          },
                        ),
                        ChoiceChip(
                          label: const Text('Parts'),
                          selected: selected == _LabelLayoutElement.partsText,
                          onSelected: (_) {
                            setStateDialog(() {
                              selected = _LabelLayoutElement.partsText;
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        const Text('Size'),
                        const Spacer(),
                        IconButton(
                          tooltip: 'Decrease',
                          onPressed: () => updateScale(-0.04),
                          icon: const Icon(Icons.remove_circle_outline),
                        ),
                        IconButton(
                          tooltip: 'Increase',
                          onPressed: () => updateScale(0.04),
                          icon: const Icon(Icons.add_circle_outline),
                        ),
                      ],
                    ),
                    Row(
                      children: <Widget>[
                        const Text('Move'),
                        const Spacer(),
                        IconButton(
                          tooltip: 'Left',
                          onPressed: () => moveSelected(-4, 0),
                          icon: const Icon(Icons.arrow_left),
                        ),
                        IconButton(
                          tooltip: 'Up',
                          onPressed: () => moveSelected(0, -4),
                          icon: const Icon(Icons.arrow_drop_up),
                        ),
                        IconButton(
                          tooltip: 'Down',
                          onPressed: () => moveSelected(0, 4),
                          icon: const Icon(Icons.arrow_drop_down),
                        ),
                        IconButton(
                          tooltip: 'Right',
                          onPressed: () => moveSelected(4, 0),
                          icon: const Icon(Icons.arrow_right),
                        ),
                      ],
                    ),
                    TextButton(
                      onPressed: () {
                        setStateDialog(() {
                          qrScale = 0.78;
                          qrOffsetX = 0;
                          qrOffsetY = 0;
                          mainScale = 1.0;
                          mainOffsetX = 0;
                          mainOffsetY = 0;
                          partsScale = 1.0;
                          partsOffsetX = 0;
                          partsOffsetY = 0;
                        });
                      },
                      child: const Text('Reset defaults'),
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
                  onPressed: () async {
                    Navigator.of(dialogContext).pop();
                    if (!mounted) return;
                    setState(() {
                      _labelQrScale = qrScale;
                      _labelQrOffsetX = qrOffsetX;
                      _labelQrOffsetY = qrOffsetY;
                      _labelMainScale = mainScale;
                      _labelMainOffsetX = mainOffsetX;
                      _labelMainOffsetY = mainOffsetY;
                      _labelPartsScale = partsScale;
                      _labelPartsOffsetX = partsOffsetX;
                      _labelPartsOffsetY = partsOffsetY;
                    });
                    try {
                      await _saveLabelLayoutSettings();
                    } catch (_) {
                      if (!mounted) return;
                      _showMessage(
                        'Saved locally, but failed to sync global layout.',
                        error: true,
                      );
                      return;
                    }
                    if (!mounted) return;
                    _showMessage('Label layout saved for all users.');
                  },
                  child: Text(strings.text('save')),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _LabelLayoutPreviewPainter extends CustomPainter {
  const _LabelLayoutPreviewPainter({
    required this.printWidth,
    required this.printHeight,
    required this.qrScale,
    required this.qrOffsetX,
    required this.qrOffsetY,
    required this.mainScale,
    required this.mainOffsetX,
    required this.mainOffsetY,
    required this.partsScale,
    required this.partsOffsetX,
    required this.partsOffsetY,
    required this.selected,
  });

  final double printWidth;
  final double printHeight;
  final double qrScale;
  final double qrOffsetX;
  final double qrOffsetY;
  final double mainScale;
  final double mainOffsetX;
  final double mainOffsetY;
  final double partsScale;
  final double partsOffsetX;
  final double partsOffsetY;
  final _LabelLayoutElement selected;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint bg = Paint()..color = Colors.white;
    final Paint border = Paint()
      ..color = const Color(0xFFB8C4CF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawRect(Offset.zero & size, bg);
    canvas.drawRect(Offset.zero & size, border);

    final double sx = size.width / printWidth;
    final double sy = size.height / printHeight;
    final double qrMaxByWidth = (printWidth - 20).clamp(120, printWidth);
    final double qrMaxByHeight = (printHeight * 0.60).clamp(120, printHeight);
    final double qrMax = math.min(qrMaxByWidth, qrMaxByHeight);
    final double qrSize = (printWidth * qrScale).clamp(120, qrMax).toDouble();
    final double qrTopPadding = (printHeight * 0.01).clamp(4, 12).toDouble();
    final double qrX =
        (((printWidth - qrSize) / 2) + qrOffsetX).clamp(0, printWidth - qrSize);
    final double qrY =
        (qrTopPadding + qrOffsetY).clamp(0, printHeight - qrSize);

    final Rect qrRect =
        Rect.fromLTWH(qrX * sx, qrY * sy, qrSize * sx, qrSize * sy);
    canvas.drawRect(
      qrRect,
      Paint()
        ..color = const Color(0xFFECEFF3)
        ..style = PaintingStyle.fill,
    );
    canvas.drawRect(
      qrRect,
      Paint()
        ..color = Colors.black
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );

    final TextPainter qrText = TextPainter(
      text: const TextSpan(
        text: 'QR',
        style: TextStyle(
          color: Colors.black54,
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    qrText.paint(
      canvas,
      Offset(qrRect.center.dx - qrText.width / 2,
          qrRect.center.dy - qrText.height / 2),
    );

    final TextPainter main = TextPainter(
      text: TextSpan(
        text: '88A',
        style: TextStyle(
          color: Colors.black,
          fontWeight: FontWeight.w800,
          fontSize: 30 * mainScale * sy,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: size.width - 20);
    final double mainBaseY = (qrY + qrSize + 10) * sy;
    final Offset mainOffset = Offset(
      ((size.width - main.width) / 2) + (mainOffsetX * sx),
      mainBaseY + (mainOffsetY * sy),
    );
    main.paint(canvas, mainOffset);

    final TextPainter parts = TextPainter(
      text: TextSpan(
        text: '1/3',
        style: TextStyle(
          color: Colors.black87,
          fontWeight: FontWeight.w600,
          fontSize: 20 * partsScale * sy,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: size.width - 20);
    final Offset partsOffset = Offset(
      ((size.width - parts.width) / 2) + (partsOffsetX * sx),
      mainOffset.dy + main.height + (6 * sy) + (partsOffsetY * sy),
    );
    parts.paint(canvas, partsOffset);

    Rect selectedRect;
    switch (selected) {
      case _LabelLayoutElement.qr:
        selectedRect = qrRect;
        break;
      case _LabelLayoutElement.mainText:
        selectedRect = mainOffset & main.size;
        break;
      case _LabelLayoutElement.partsText:
        selectedRect = partsOffset & parts.size;
        break;
    }
    canvas.drawRect(
      selectedRect.inflate(3),
      Paint()
        ..color = uiNavy
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6,
    );
  }

  @override
  bool shouldRepaint(covariant _LabelLayoutPreviewPainter oldDelegate) {
    return oldDelegate.qrScale != qrScale ||
        oldDelegate.qrOffsetX != qrOffsetX ||
        oldDelegate.qrOffsetY != qrOffsetY ||
        oldDelegate.mainScale != mainScale ||
        oldDelegate.mainOffsetX != mainOffsetX ||
        oldDelegate.mainOffsetY != mainOffsetY ||
        oldDelegate.partsScale != partsScale ||
        oldDelegate.partsOffsetX != partsOffsetX ||
        oldDelegate.partsOffsetY != partsOffsetY ||
        oldDelegate.selected != selected ||
        oldDelegate.printWidth != printWidth ||
        oldDelegate.printHeight != printHeight;
  }
}
