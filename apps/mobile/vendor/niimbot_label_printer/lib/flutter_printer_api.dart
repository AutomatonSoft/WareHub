import 'package:flutter/services.dart';

import 'method_channel_bridge.dart';
import 'niimbot_label_printer.dart';

class FlutterPrinterApi {
  FlutterPrinterApi({MethodChannel? channel})
      : _bridge = MethodChannelBridge(
          channel ?? const MethodChannel('niimbot_label_printer'),
        );

  final MethodChannelBridge _bridge;

  Future<bool> requestPermissionGrant() async {
    final bool? value =
        await _bridge.invoke<bool>('ispermissionbluetoothgranted');
    return value ?? false;
  }

  Future<bool> bluetoothIsEnabled() async {
    final bool? value = await _bridge.invoke<bool>('isBluetoothEnabled');
    return value ?? false;
  }

  Future<bool> isPrinterConnected() async {
    final bool? value = await _bridge.invoke<bool>('isPrinterConnected');
    return value ?? false;
  }

  Future<List<BluetoothDevice>> getPairedDevices() async {
    final List<Object?>? raw =
        await _bridge.invoke<List<Object?>>('getPairedDevices');
    return (raw ?? const <Object?>[])
        .map((Object? item) => BluetoothDevice.fromString(item.toString()))
        .toList();
  }

  Future<List<BluetoothDevice>> getAvailableDevices(
      {int scanSeconds = 6}) async {
    final int scanMillis = (scanSeconds * 1000).clamp(1000, 15000);
    final List<Object?>? raw = await _bridge.invoke<List<Object?>>(
      'getAvailableDevices',
      <String, dynamic>{'scanMillis': scanMillis},
    );
    return (raw ?? const <Object?>[])
        .map((Object? item) => BluetoothDevice.fromString(item.toString()))
        .toList();
  }

  Future<PrinterOperationResult> connectPrinter(
    BluetoothDevice device, {
    bool pairFirst = false,
  }) async {
    final String method =
        pairFirst ? 'pairAndConnectDetailed' : 'connectDetailed';
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>(method, <String, dynamic>{
      'address': device.address,
    });
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> disconnectPrinter() async {
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>('disconnectPrinter');
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> getPrinterInfo() async {
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>('getPrinterInfo');
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> getPrinterStatus() async {
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>('getPrinterStatus');
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> printImage(PrintData data) async {
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>('printImage', data.toMap());
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> printLabel(PrintData data) async {
    final Map<Object?, Object?>? raw =
        await _bridge.invoke<Map<Object?, Object?>>('printLabel', data.toMap());
    return PrinterOperationResult.fromMap(raw);
  }

  Future<PrinterOperationResult> debugPrintTestPattern({
    int labelType = 5,
    int density = 3,
    String bitOrder = 'MSB',
    bool invertPackedBits = false,
  }) async {
    final Map<Object?, Object?>? raw = await _bridge
        .invoke<Map<Object?, Object?>>(
            'debugPrintTestPattern', <String, dynamic>{
      'labelType': labelType,
      'density': density,
      'bitOrder': bitOrder,
      'invertPackedBits': invertPackedBits,
    });
    return PrinterOperationResult.fromMap(raw);
  }
}
