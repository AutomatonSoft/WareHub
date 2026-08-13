// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePagePrintConnection on _QrHomePageState {
  static const String _savedPrinterMacKey = 'sofortbot_mobile_last_printer_mac';

  String _normalizeMac(String mac) {
    return mac.trim().replaceAll('-', ':').toUpperCase();
  }

  Future<String?> _loadSavedPrinterMac() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final String raw = (prefs.getString(_savedPrinterMacKey) ?? '').trim();
    if (raw.isEmpty) {
      return null;
    }
    return _normalizeMac(raw);
  }

  Future<void> _saveSavedPrinterMac(String mac) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final String normalized = _normalizeMac(mac);
    if (normalized.isEmpty) {
      await prefs.remove(_savedPrinterMacKey);
      return;
    }
    await prefs.setString(_savedPrinterMacKey, normalized);
  }

  bool _isLikelyNiimbotDevice(BluetoothDevice d) {
    final String name = d.name.toUpperCase();
    return name.contains('NIMBOT') ||
        name.contains('NIIMBOT') ||
        name.contains('B1') ||
        name.contains('MHT');
  }

  Future<void> _ensureNimbotConnection() async {
    final Future<void>? inFlight = _connectPrinterFuture;
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final Future<void> task = _ensureNimbotConnectionInternal();
    _connectPrinterFuture = task;
    try {
      await task;
    } finally {
      if (identical(_connectPrinterFuture, task)) {
        _connectPrinterFuture = null;
      }
    }
  }

  Future<void> _ensureNimbotConnectionInternal() async {
    final AppStrings strings = _strings;
    // Trust our own tracked state instead of pinging the plugin's
    // isConnected(), which writes a stray byte into the live protocol
    // stream (see niimbot_label_printer's isConnected handler). Some
    // Niimbot firmwares drop the connection when they see a byte outside
    // the 0x55 0x55 packet framing, so probing right before a print can
    // itself cause the disconnect. A real failure still self-heals via the
    // retry path in _sendPrintData, which explicitly disconnects first.
    if (_printerConnected) {
      return;
    }

    final bool runtimePermissionsGranted =
        await _ensureBluetoothRuntimePermissions();
    if (!runtimePermissionsGranted) {
      throw Exception(
        strings.text('bluetooth_permission_settings'),
      );
    }

    // Plugin-level permission helper may return false on some vendor ROMs even
    // when runtime permissions are already granted. Do not hard-fail here.
    final bool pluginPermissionGranted =
        await _printer.requestPermissionGrant();
    if (!pluginPermissionGranted) {
      unawaited(
        sendMobileLog(
          'warn',
          'niimbot plugin permission helper returned false; continue with runtime permissions',
        ),
      );
    }

    final bool bluetoothEnabled = await _printer.bluetoothIsEnabled();
    if (!bluetoothEnabled) {
      throw Exception(strings.text('bluetooth_disabled'));
    }

    final String? savedMac = await _loadSavedPrinterMac();
    if ((savedMac ?? '').isNotEmpty) {
      final bool savedConnected = await _printer.connect(
        BluetoothDevice(name: 'Saved Printer', address: savedMac!),
      );
      if (savedConnected) {
        _printerConnected = true;
        return;
      }
    }

    // _connectPrinterWithPicker throws on failure, so reaching this point
    // means connect() already reported success.
    await _connectPrinterWithPicker();
    _printerConnected = true;
  }

  Future<void> _connectToDevice(BluetoothDevice selected) async {
    final bool connected = await _printer.connect(selected);
    if (!connected) {
      throw Exception(
        'Failed to connect to printer ${selected.name} (${selected.address}).',
      );
    }
    await _saveSavedPrinterMac(selected.address);
  }

  Future<void> _connectPrinterWithPicker() async {
    final List<BluetoothDevice> paired = await _printer.getPairedDevices();
    if (paired.isEmpty) {
      throw Exception(_strings.text('no_printers_found'));
    }
    final List<BluetoothDevice> candidates =
        paired.where(_isLikelyNiimbotDevice).toList();
    final List<BluetoothDevice> pickerDevices =
        candidates.isNotEmpty ? candidates : paired;

    final BluetoothDevice? selected =
        await _showPrinterDevicePicker(pickerDevices);
    if (selected == null) {
      throw Exception(_strings.text('printer_selection_cancelled'));
    }
    await _connectToDevice(selected);
  }

  Future<BluetoothDevice?> _showPrinterDevicePicker(
    List<BluetoothDevice> devices,
  ) async {
    if (!mounted) {
      return null;
    }

    BluetoothDevice? selectedDevice;
    return showDialog<BluetoothDevice>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, void Function(void Function()) setD) {
            final AppStrings strings = AppStrings.of(dialogContext);
            return AlertDialog(
              title: Text(strings.text('select_printer')),
              content: SizedBox(
                width: 380,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: devices.map((BluetoothDevice device) {
                      final bool isSelected =
                          selectedDevice?.address == device.address;
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.bluetooth_connected),
                        title: Text(
                          device.name.trim().isEmpty
                              ? strings.text('unknown_device')
                              : device.name,
                        ),
                        subtitle: Text(device.address),
                        trailing: isSelected
                            ? const Icon(Icons.check_circle,
                                color: Colors.green)
                            : null,
                        onTap: () {
                          setD(() {
                            selectedDevice = device;
                          });
                        },
                      );
                    }).toList(),
                  ),
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
                ),
                FilledButton(
                  onPressed: selectedDevice == null
                      ? null
                      : () => Navigator.of(dialogContext).pop(selectedDevice),
                  child: Text(strings.text('connect')),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _preparePrinterInBackground() async {
    if (_preparingPrinter ||
        _connectPrinterFuture != null ||
        _printerConnected) {
      return;
    }
    _preparingPrinter = true;
    try {
      final String? savedMac = await _loadSavedPrinterMac();
      if ((savedMac ?? '').isEmpty) {
        return;
      }
      final bool runtimePermissionsGranted =
          await _ensureBluetoothRuntimePermissions();
      if (!runtimePermissionsGranted) {
        return;
      }
      final bool bluetoothEnabled = await _printer.bluetoothIsEnabled();
      if (!bluetoothEnabled) {
        return;
      }
      final bool connected = await _printer.connect(
        BluetoothDevice(name: 'Saved Printer', address: savedMac!),
      );
      _printerConnected = connected;
    } catch (_) {
      // Keep silent: startup auto-connect is best-effort.
      _printerConnected = false;
    } finally {
      _preparingPrinter = false;
      if (mounted) {
        setState(() {});
      }
    }
  }

  Future<void> _refreshPrinterConnectionStatus() async {
    if (_printerConnected) {
      // Already believed connected - skip the native ping so we don't risk
      // tripping the printer's connection with a stray non-protocol byte.
      return;
    }
    try {
      final bool connected = await _printer.isConnected();
      if (!mounted) return;
      setState(() {
        _printerConnected = connected;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _printerConnected = false;
      });
    }
  }

  Future<void> _onConnectPrinterTap() async {
    if (_connectingPrinter) {
      return;
    }
    setState(() {
      _connectingPrinter = true;
    });
    try {
      if (_printerConnected) {
        _showMessage(_strings.text('printer_connected_message'));
        return;
      }
      await _ensureNimbotConnection();
      if (!mounted) return;
      setState(() {
        _printerConnected = true;
      });
      _showMessage(_strings.text('printer_connected_message'));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _printerConnected = false;
      });
      final String message = 'Connect printer failed: $error';
      if (message.toLowerCase().contains('permission')) {
        _showMessage(
          _strings.text('bluetooth_permission_body'),
          error: true,
        );
      } else {
        _showMessage(message, error: true);
      }
    } finally {
      if (mounted) {
        setState(() {
          _connectingPrinter = false;
        });
      }
    }
  }

  Future<void> _sendPrintData(PrintData printData) async {
    await _ensureNimbotConnection();
    bool printed = await _printer.send(printData);
    if (printed) {
      _printerConnected = true;
      return;
    }

    await Future<void>.delayed(const Duration(milliseconds: 1500));
    await _printer.disconnect();
    _printerConnected = false;
    await _ensureNimbotConnection();
    printed = await _printer.send(printData);
    if (printed) {
      _printerConnected = true;
      return;
    }

    throw Exception(
        'Printer failed to print. Check the connection and try again.');
  }
}
