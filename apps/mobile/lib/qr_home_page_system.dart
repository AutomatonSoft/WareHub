// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageSystem on _QrHomePageState {
  double _safeClampDouble(double value, double min, double max) {
    if (max < min) {
      return min;
    }
    return value.clamp(min, max).toDouble();
  }

  Future<void> _loadPrintSettings() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final int width = prefs.getInt('print_width_px') ?? 384;
    final int height = prefs.getInt('print_height_px') ?? 640;
    final int density = prefs.getInt('print_density') ?? 5;
    final int labelType = prefs.getInt('print_label_type') ?? 1;
    final int interLabelDelayMs =
        prefs.getInt('print_inter_label_delay_ms') ?? 120;
    setState(() {
      _printWidthPx = (width >= 300 && width <= 600) ? width : 384;
      _printHeightPx = (height >= 500 && height <= 900) ? height : 640;
      _printDensity = density.clamp(1, 5);
      _printLabelType = labelType.clamp(0, 5);
      _printInterLabelDelayMs = interLabelDelayMs.clamp(0, 2000);
      _previewOnlyMode = prefs.getBool('print_preview_only') ?? false;
      _labelQrScale = prefs.getDouble('label_qr_scale') ?? 0.78;
      _labelQrOffsetX = prefs.getDouble('label_qr_offset_x') ?? 0;
      _labelQrOffsetY = prefs.getDouble('label_qr_offset_y') ?? 0;
      _labelMainScale = prefs.getDouble('label_main_scale') ?? 1.0;
      _labelMainOffsetX = prefs.getDouble('label_main_offset_x') ?? 0;
      _labelMainOffsetY = prefs.getDouble('label_main_offset_y') ?? 0;
      _labelPartsScale = prefs.getDouble('label_parts_scale') ?? 1.0;
      _labelPartsOffsetX = prefs.getDouble('label_parts_offset_x') ?? 0;
      _labelPartsOffsetY = prefs.getDouble('label_parts_offset_y') ?? 0;
    });
    await _savePrinterSetupSettingsLocal();
    await _syncPrinterSetupFromServer();
    await _syncLabelLayoutFromServer();
  }

  Future<void> _checkForUpdates({bool silentIfLatest = true}) async {
    setState(() {
      _checkingUpdates = true;
    });

    try {
      final MobileUpdateInfo? info =
          await loadMobileUpdateInfo(_effectiveApiBase());
      if (!mounted || info == null) {
        return;
      }
      setState(() {
        _updateInfo = info;
      });
      if (info.updateAvailable) {
        _promptAppUpdate(info);
      } else if (!silentIfLatest) {
        _showMessage(
          _strings.format('latest_version', <String, String>{
            'version': info.currentVersion,
          }),
        );
      }
    } catch (_) {
      if (!silentIfLatest) {
        _showMessage(_strings.text('failed_check_updates'), error: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _checkingUpdates = false;
        });
      }
    }
  }

  Future<void> _onUpdateTap() async {
    final MobileUpdateInfo? info = _updateInfo;
    if (info == null) {
      await _checkForUpdates(silentIfLatest: false);
      return;
    }
    if (!info.updateAvailable) {
      _showMessage(
        _strings.format('latest_version', <String, String>{
          'version': info.currentVersion,
        }),
      );
      return;
    }
    if (info.apkUrl.trim().isEmpty) {
      _showMessage(_strings.text('update_link_missing'), error: true);
      return;
    }

    final Uri uri = Uri.parse(info.apkUrl);
    final bool launched =
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      _showMessage(_strings.text('failed_open_update'), error: true);
      return;
    }
    _showMessage(_strings.text('update_started'));
  }

  Future<void> _promptAppUpdate(MobileUpdateInfo info) async {
    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        final AppStrings strings = AppStrings.of(dialogContext);
        return AlertDialog(
          title: Text(strings.text('update_available_title')),
          content: Text(
            strings.format('update_available_body', <String, String>{
              'current': info.currentVersion,
              'latest': info.latestVersion,
              'channel': info.channel,
            }),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(strings.text('update_later')),
            ),
            FilledButton(
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                await _onUpdateTap();
              },
              child: Text(strings.text('update_now')),
            ),
          ],
        );
      },
    );
  }

  void _showPermissionSettingsMessage(String message) {
    if (!mounted) {
      return;
    }

    final AppStrings strings = _strings;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red.shade700,
          action: SnackBarAction(
            label: strings.text('settings'),
            onPressed: () {
              openAppSettings();
            },
          ),
        ),
      );
  }

  bool _isPermissionUsable(PermissionStatus status) {
    return status.isGranted || status.isLimited;
  }

  int? _androidSdkIntFromSystemVersion() {
    if (!Platform.isAndroid) {
      return null;
    }
    final String osVersion = Platform.operatingSystemVersion;
    final RegExpMatch? sdkMatch = RegExp(
      r'SDK\s*(\d+)',
      caseSensitive: false,
    ).firstMatch(osVersion);
    if (sdkMatch == null) {
      return null;
    }
    return int.tryParse(sdkMatch.group(1) ?? '');
  }

  bool _needsLegacyLocationPermission() {
    final int? sdkInt = _androidSdkIntFromSystemVersion();
    // If parsing fails, default to modern permissions only to avoid
    // requesting undeclared legacy location on Android 12+.
    return sdkInt != null && sdkInt <= 30;
  }

  Future<bool> _hasBluetoothRuntimePermissions() async {
    if (!Platform.isAndroid) {
      return true;
    }
    final bool needsLegacyLocation = _needsLegacyLocationPermission();
    final PermissionStatus connectStatus =
        await Permission.bluetoothConnect.status;
    final PermissionStatus scanStatus = await Permission.bluetoothScan.status;
    final PermissionStatus locationStatus = needsLegacyLocation
        ? await Permission.locationWhenInUse.status
        : PermissionStatus.denied;
    final bool hasConnect = _isPermissionUsable(connectStatus);
    final bool hasScanOrLegacyLocation =
        _isPermissionUsable(scanStatus) || _isPermissionUsable(locationStatus);
    return hasConnect && hasScanOrLegacyLocation;
  }

  Future<bool> _ensureBluetoothRuntimePermissions() async {
    if (!Platform.isAndroid) {
      return true;
    }
    final bool needsLegacyLocation = _needsLegacyLocationPermission();
    final List<Permission> permissionsToRequest = <Permission>[
      Permission.bluetoothConnect,
      Permission.bluetoothScan,
      Permission.bluetoothAdvertise,
      if (needsLegacyLocation) Permission.locationWhenInUse,
    ];

    // Ask modern Android 12+ permissions and legacy location only on <=11.
    final Map<Permission, PermissionStatus> statuses =
        await permissionsToRequest.request();

    final PermissionStatus connectStatus =
        statuses[Permission.bluetoothConnect] ??
            await Permission.bluetoothConnect.status;
    final PermissionStatus scanStatus = statuses[Permission.bluetoothScan] ??
        await Permission.bluetoothScan.status;
    final PermissionStatus locationStatus = needsLegacyLocation
        ? (statuses[Permission.locationWhenInUse] ??
            await Permission.locationWhenInUse.status)
        : PermissionStatus.denied;

    final bool hasConnect = _isPermissionUsable(connectStatus);
    final bool hasScanOrLegacyLocation =
        _isPermissionUsable(scanStatus) || _isPermissionUsable(locationStatus);

    return hasConnect && hasScanOrLegacyLocation;
  }

  Future<bool> _ensureCameraRuntimePermission() async {
    final PermissionStatus status = await Permission.camera.request();
    return _isPermissionUsable(status);
  }

  Future<bool> _isCameraPermissionGranted() async {
    final PermissionStatus status = await Permission.camera.status;
    return _isPermissionUsable(status);
  }

  Future<bool> _showPermissionPrimer({
    required String title,
    required String message,
  }) async {
    if (!mounted) {
      return false;
    }
    final AppStrings strings = _strings;
    final bool? allow = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(strings.text('permission_dont_allow')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(strings.text('permission_allow')),
            ),
          ],
        );
      },
    );
    return allow == true;
  }

  Future<void> _runStartupPermissionFlow() async {
    if (!mounted || _startupPermissionHandled) {
      return;
    }
    _startupPermissionHandled = true;

    final bool cameraGranted = await _isCameraPermissionGranted();
    if (!cameraGranted) {
      final bool allowCamera = await _showPermissionPrimer(
        title: _strings.text('camera_permission_title'),
        message: _strings.text('camera_permission_body'),
      );
      if (allowCamera) {
        final bool granted = await _ensureCameraRuntimePermission();
        if (!granted) {
          _showMessage(_strings.text('camera_permission_denied'), error: true);
        }
      }
    }

    final bool bluetoothGranted = await _hasBluetoothRuntimePermissions();
    if (!bluetoothGranted) {
      final bool allowBluetooth = await _showPermissionPrimer(
        title: _strings.text('bluetooth_permission_title'),
        message: _strings.text('bluetooth_permission_body'),
      );
      if (allowBluetooth) {
        final bool granted = await _ensureBluetoothRuntimePermissions();
        if (!granted) {
          _showMessage(
            _strings.text('bluetooth_permission_denied'),
            error: true,
          );
        }
      }
    }

    if (await _hasBluetoothRuntimePermissions()) {
      unawaited(_preparePrinterInBackground());
    }
  }

  String _buildLabelQrPayload(String warehouseLocation) {
    return warehouseLocation.trim().toUpperCase().replaceAll(' ', '');
  }

  Future<ui.Image> _buildLabelImage(
    String data, {
    required String mainCaption,
    String? partsCaption,
  }) async {
    final int qrMaxByWidth = (_printWidthPx - 20).clamp(120, _printWidthPx);
    final int qrMaxByHeight =
        (_printHeightPx * 0.60).round().clamp(120, _printHeightPx);
    final int qrMaxSize = math.min(qrMaxByWidth, qrMaxByHeight);
    final int qrSize =
        (_printWidthPx * _labelQrScale).round().clamp(120, qrMaxSize);
    final QrPainter painter = QrPainter(
      data: data,
      version: QrVersions.auto,
      gapless: true,
      eyeStyle: const QrEyeStyle(
        eyeShape: QrEyeShape.square,
        color: Colors.black,
      ),
      dataModuleStyle: const QrDataModuleStyle(
        dataModuleShape: QrDataModuleShape.square,
        color: Colors.black,
      ),
    );

    final ui.PictureRecorder qrRecorder = ui.PictureRecorder();
    final Canvas qrCanvas = Canvas(qrRecorder);
    painter.paint(qrCanvas, Size(qrSize.toDouble(), qrSize.toDouble()));
    final ui.Picture qrPicture = qrRecorder.endRecording();
    final ui.Image qrImage = await qrPicture.toImage(qrSize, qrSize);

    final ui.PictureRecorder recorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(recorder);
    final Paint paint = Paint()
      ..filterQuality = FilterQuality.none
      ..isAntiAlias = false;
    canvas.drawRect(
      Rect.fromLTWH(0, 0, _printWidthPx.toDouble(), _printHeightPx.toDouble()),
      Paint()..color = Colors.white,
    );
    final double baseDx = (_printWidthPx - qrSize) / 2;
    final double topPadding = (_printHeightPx * 0.01).clamp(4, 12).toDouble();
    final double dx = (baseDx + _labelQrOffsetX)
        .clamp(0, (_printWidthPx - qrSize).toDouble());
    final double dy = (topPadding + _labelQrOffsetY)
        .clamp(0, (_printHeightPx - qrSize).toDouble());
    canvas.drawImageRect(
      qrImage,
      Rect.fromLTWH(0, 0, qrSize.toDouble(), qrSize.toDouble()),
      Rect.fromLTWH(dx, dy, qrSize.toDouble(), qrSize.toDouble()),
      paint,
    );

    final double textZoneTop = dy + qrSize + 6;
    final double textZoneHeight =
        (_printHeightPx - textZoneTop - 6).clamp(24, _printHeightPx.toDouble());
    final bool hasParts =
        partsCaption != null && partsCaption.trim().isNotEmpty;
    final double mainFontSize =
        ((textZoneHeight * (hasParts ? 0.46 : 0.64)) * _labelMainScale)
            .clamp(30, 124)
            .toDouble();
    final double textSidePadding =
        (_printWidthPx * 0.04).clamp(12, 24).toDouble();
    final double mainMaxWidth =
        _printWidthPx.toDouble() - (textSidePadding * 2);
    double fittedMainFontSize = mainFontSize;
    late TextPainter mainTextPainter;
    while (true) {
      mainTextPainter = TextPainter(
        text: TextSpan(
          text: mainCaption,
          style: TextStyle(
            color: Colors.black,
            fontSize: fittedMainFontSize,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        textAlign: TextAlign.center,
      );
      mainTextPainter.layout(maxWidth: mainMaxWidth);
      final bool overflowed = mainTextPainter.didExceedMaxLines;
      if ((!overflowed && mainTextPainter.width <= mainMaxWidth) ||
          fittedMainFontSize <= 10) {
        break;
      }
      fittedMainFontSize -= 1;
    }
    // Final hard guard: if a custom scale/offset still causes overflow,
    // shrink proportionally to keep full warehouse code visible.
    if (mainTextPainter.didExceedMaxLines) {
      final double shrink = (mainMaxWidth /
              (mainTextPainter.width == 0 ? 1 : mainTextPainter.width))
          .clamp(0.1, 1.0)
          .toDouble();
      fittedMainFontSize =
          (fittedMainFontSize * shrink).clamp(8, 124).toDouble();
      mainTextPainter = TextPainter(
        text: TextSpan(
          text: mainCaption,
          style: TextStyle(
            color: Colors.black,
            fontSize: fittedMainFontSize,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        textAlign: TextAlign.center,
      );
      mainTextPainter.layout(maxWidth: mainMaxWidth);
    }

    TextPainter? partsTextPainter;
    if (hasParts) {
      partsTextPainter = TextPainter(
        text: TextSpan(
          text: partsCaption,
          style: TextStyle(
            color: Colors.black87,
            fontSize: ((textZoneHeight * 0.20) * _labelPartsScale)
                .clamp(12, 36)
                .toDouble(),
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        textAlign: TextAlign.center,
      );
      partsTextPainter.layout(
        maxWidth: _printWidthPx.toDouble() - (textSidePadding * 2),
      );
    }

    final double totalTextHeight = mainTextPainter.height +
        (partsTextPainter?.height ?? 0) +
        (hasParts ? 4 : 0);
    final double startY = (textZoneTop + 2).clamp(
      0,
      (_printHeightPx.toDouble() - totalTextHeight)
          .clamp(0, _printHeightPx.toDouble()),
    );
    final double mainRightBound = math.max(
      textSidePadding,
      _printWidthPx.toDouble() - textSidePadding - mainTextPainter.width,
    );
    final double mainX = _safeClampDouble(
      ((_printWidthPx - mainTextPainter.width) / 2) + _labelMainOffsetX,
      textSidePadding,
      mainRightBound,
    );
    final double mainY = (startY + _labelMainOffsetY).clamp(
      0,
      _printHeightPx.toDouble() - mainTextPainter.height,
    );
    mainTextPainter.paint(canvas, Offset(mainX, mainY));
    if (partsTextPainter != null) {
      final double partsRightBound = math.max(
        textSidePadding,
        _printWidthPx.toDouble() - textSidePadding - partsTextPainter.width,
      );
      final double partsX = _safeClampDouble(
        ((_printWidthPx - partsTextPainter.width) / 2) + _labelPartsOffsetX,
        textSidePadding,
        partsRightBound,
      );
      final double partsY =
          (mainY + mainTextPainter.height + 4 + _labelPartsOffsetY).clamp(
        0,
        _printHeightPx.toDouble() - partsTextPainter.height,
      );
      partsTextPainter.paint(
        canvas,
        Offset(partsX, partsY),
      );
    }

    final ui.Picture picture = recorder.endRecording();
    return picture.toImage(_printWidthPx, _printHeightPx);
  }

  Future<ui.Image> _fitImageToLabelCanvas(ui.Image image) async {
    final double widthRatio = _printWidthPx / image.width;
    final double heightRatio = _printHeightPx / image.height;
    final double scale = widthRatio < heightRatio ? widthRatio : heightRatio;
    final int targetWidth =
        (image.width * scale).round().clamp(1, _printWidthPx);
    final int targetHeight =
        (image.height * scale).round().clamp(1, _printHeightPx);

    final ui.PictureRecorder recorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(recorder);
    final Paint paint = Paint();
    canvas.drawRect(
      Rect.fromLTWH(0, 0, _printWidthPx.toDouble(), _printHeightPx.toDouble()),
      Paint()..color = Colors.white,
    );
    final double dx = (_printWidthPx - targetWidth) / 2;
    final double dy = (_printHeightPx - targetHeight) / 2;
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      Rect.fromLTWH(dx, dy, targetWidth.toDouble(), targetHeight.toDouble()),
      paint,
    );
    final ui.Picture picture = recorder.endRecording();
    return picture.toImage(_printWidthPx, _printHeightPx);
  }
}
