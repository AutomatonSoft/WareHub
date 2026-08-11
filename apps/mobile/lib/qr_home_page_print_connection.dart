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
    // Fast path: if session is still alive, skip permission/helper checks.
    final bool alreadyConnected = await _printer.isConnected();
    if (alreadyConnected) {
      _printerConnected = true;
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
      final PrinterOperationResult savedResult = await _printer.connectDetailed(
        BluetoothDevice(name: 'Saved Printer', address: savedMac!),
        allowClassicFallback: false,
      );
      if (savedResult.ok) {
        _printerConnected = true;
        return;
      }
    }

    await _connectPrinterWithPicker();
    final bool connected = await _printer.isConnected();
    if (!connected) {
      throw Exception(strings
          .text('printer_connect_failed')
          .replaceAll(
            '{name}',
            'Niimbot',
          )
          .replaceAll('{address}', 'unknown'));
    }
    _printerConnected = true;
  }

  Future<void> _connectToDevice(BluetoothDevice selected) async {
    final List<BluetoothDevice> paired = await _printer.getPairedDevices();
    final bool shouldPairFirst = !paired
        .map((BluetoothDevice d) => d.address.toUpperCase())
        .contains(selected.address.toUpperCase());
    final PrinterOperationResult result = shouldPairFirst
        ? await _printer.pairAndConnectDetailed(
            selected,
            allowClassicFallback: false,
          )
        : await _printer.connectDetailed(
            selected,
            allowClassicFallback: false,
          );
    if (!result.ok) {
      throw Exception(
        'Printer returned error code=${result.code} message=${result.message}',
      );
    }
    await _saveSavedPrinterMac(selected.address);
  }

  Future<void> _connectPrinterWithPicker() async {
    final List<BluetoothDevice> paired = await _printer.getPairedDevices();
    final Set<String> pairedAddresses =
        paired.map((BluetoothDevice d) => d.address.toUpperCase()).toSet();
    final List<BluetoothDevice> available =
        await _printer.getAvailableDevices(scanSeconds: 8);
    if (available.isEmpty) {
      throw Exception(_strings.text('no_printers_found'));
    }
    final List<BluetoothDevice> candidates =
        available.where(_isLikelyNiimbotDevice).toList();
    final List<BluetoothDevice> pickerDevices =
        candidates.isNotEmpty ? candidates : available;

    final BluetoothDevice? selected = await _showPrinterDevicePicker(
      pickerDevices,
      pairedAddresses: pairedAddresses,
    );
    if (selected == null) {
      throw Exception(_strings.text('printer_selection_cancelled'));
    }
    await _connectToDevice(selected);
  }

  Future<BluetoothDevice?> _showPrinterDevicePicker(
    List<BluetoothDevice> devices, {
    Set<String>? pairedAddresses,
  }) async {
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
                      final bool isPaired = pairedAddresses?.contains(
                            device.address.toUpperCase(),
                          ) ??
                          false;
                      final bool isSelected =
                          selectedDevice?.address == device.address;
                      return ListTile(
                        dense: true,
                        leading: Icon(
                          isPaired
                              ? Icons.bluetooth_connected
                              : Icons.bluetooth_searching,
                        ),
                        title: Text(
                          device.name.trim().isEmpty
                              ? strings.text('unknown_device')
                              : device.name,
                        ),
                        subtitle: Text(
                          isPaired
                              ? '${device.address} - ${strings.text('paired')}'
                              : '${device.address} - ${strings.text('not_paired')}',
                        ),
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
    if (_preparingPrinter || _connectPrinterFuture != null) {
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
      final bool alreadyConnected = await _printer.isConnected();
      if (alreadyConnected) {
        _printerConnected = true;
        return;
      }
      final PrinterOperationResult result = await _printer.connectDetailed(
        BluetoothDevice(name: 'Saved Printer', address: savedMac!),
        allowClassicFallback: false,
      );
      _printerConnected = result.ok;
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

  // isConnected() only reflects that connect() once succeeded and close()
  // hasn't been called since - Android doesn't notice a silent remote
  // disconnect until the next read/write, so it can lie and say "connected"
  // long after the printer is gone. getPrinterStatus() sends a real command
  // over the link, so it actually fails when the connection is dead.
  Future<bool> _probePrinterConnectionLive() async {
    try {
      final bool cachedConnected = await _printer.isConnected();
      if (!cachedConnected) {
        return false;
      }
      final PrinterOperationResult status = await _printer.getPrinterStatus();
      return status.ok;
    } catch (_) {
      return false;
    }
  }

  Future<void> _refreshPrinterConnectionStatus() async {
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
      if (await _probePrinterConnectionLive()) {
        if (!mounted) return;
        setState(() {
          _printerConnected = true;
        });
        _showMessage(_strings.text('printer_connected_message'));
        return;
      }
      // Any cached session is stale/dead at this point - drop it so the
      // reconnect flow below opens a fresh socket instead of reusing it.
      await _printer.disconnect();
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
    PrinterOperationResult printed = await _printer.sendDetailed(printData);
    if (printed.ok) {
      _printerConnected = true;
      return;
    }

    if (isRecoverablePrintBusyError(
      code: printed.code,
      message: printed.message,
      details: printed.details,
    )) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      await _printer.disconnect();
      _printerConnected = false;
      await _ensureNimbotConnection();
      printed = await _printer.sendDetailed(printData);
      if (printed.ok) {
        _printerConnected = true;
        return;
      }
    }

    final String? hint = buildPrinterRecoveryHint(
      code: printed.code,
      message: printed.message,
      details: printed.details,
    );
    throw Exception(
      'Printer returned error code=${printed.code} message=${printed.message}${hint == null ? '' : ' Hint: $hint'}',
    );
  }
}
