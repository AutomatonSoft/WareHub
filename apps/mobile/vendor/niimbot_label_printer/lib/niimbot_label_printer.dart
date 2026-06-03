import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'flutter_printer_api.dart';

class NiimbotLabelPrinter {
  NiimbotLabelPrinter({MethodChannel? channel})
      : _api = FlutterPrinterApi(channel: channel);

  final FlutterPrinterApi _api;

  Future<String?> getPlatformVersion() async {
    return const MethodChannel('niimbot_label_printer')
        .invokeMethod<String>('getPlatformVersion');
  }

  Future<bool> requestPermissionGrant() => _api.requestPermissionGrant();

  Future<bool> bluetoothIsEnabled() => _api.bluetoothIsEnabled();

  Future<bool> isConnected() => _api.isPrinterConnected();

  Future<List<BluetoothDevice>> getPairedDevices() => _api.getPairedDevices();

  Future<List<BluetoothDevice>> getAvailableDevices({int scanSeconds = 6}) =>
      _api.getAvailableDevices(scanSeconds: scanSeconds);

  Future<bool> connect(BluetoothDevice device) async {
    final PrinterOperationResult op = await _api.connectPrinter(device);
    return op.ok;
  }

  Future<PrinterOperationResult> connectDetailed(
    BluetoothDevice device, {
    bool allowClassicFallback = false,
  }) {
    return _api.connectPrinter(device, pairFirst: false);
  }

  Future<bool> pairAndConnect(BluetoothDevice device) async {
    final PrinterOperationResult op =
        await _api.connectPrinter(device, pairFirst: true);
    return op.ok;
  }

  Future<PrinterOperationResult> pairAndConnectDetailed(
    BluetoothDevice device, {
    bool allowClassicFallback = false,
  }) {
    return _api.connectPrinter(device, pairFirst: true);
  }

  Future<bool> disconnect() async {
    final PrinterOperationResult op = await _api.disconnectPrinter();
    return op.ok;
  }

  Future<bool> send(PrintData data) async {
    final PrinterOperationResult op = await _api.printImage(data);
    return op.ok;
  }

  Future<PrinterOperationResult> sendDetailed(PrintData data) {
    return _api.printImage(data);
  }

  Future<PrinterOperationResult> connectPrinter(BluetoothDevice device,
      {bool pairFirst = false}) {
    return _api.connectPrinter(device, pairFirst: pairFirst);
  }

  Future<PrinterOperationResult> disconnectPrinter() =>
      _api.disconnectPrinter();

  Future<bool> isPrinterConnected() => _api.isPrinterConnected();

  Future<PrinterOperationResult> getPrinterInfo() => _api.getPrinterInfo();

  Future<PrinterOperationResult> getPrinterStatus() => _api.getPrinterStatus();

  Future<PrinterOperationResult> printImage(PrintData data) =>
      _api.printImage(data);

  Future<PrinterOperationResult> printLabel(PrintData data) =>
      _api.printLabel(data);

  Future<PrinterOperationResult> debugPrintTestPattern({
    int labelType = 5,
    int density = 3,
    String bitOrder = 'MSB',
    bool invertPackedBits = false,
  }) {
    return _api.debugPrintTestPattern(
      labelType: labelType,
      density: density,
      bitOrder: bitOrder,
      invertPackedBits: invertPackedBits,
    );
  }

  static Future<ui.Image> rotateImage(ui.Image image, double grades) async {
    final double angle = grades * (math.pi / 180);
    final ui.PictureRecorder recorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(recorder);

    final double longest = math.max(image.width, image.height).toDouble();
    final Size size = Size(longest, longest);

    canvas.translate(size.width / 2, size.height / 2);
    canvas.rotate(angle);
    canvas.drawImage(
        image, Offset(-image.width / 2, -image.height / 2), Paint());

    final ui.Picture picture = recorder.endRecording();
    return picture.toImage(size.width.toInt(), size.height.toInt());
  }
}

class PrinterOperationResult {
  const PrinterOperationResult({
    required this.ok,
    required this.code,
    required this.message,
    required this.details,
  });

  final bool ok;
  final String code;
  final String message;
  final Map<String, dynamic> details;

  factory PrinterOperationResult.fromMap(Map<Object?, Object?>? raw) {
    if (raw == null) {
      return const PrinterOperationResult(
        ok: false,
        code: 'ProtocolError',
        message: 'Empty operation result.',
        details: <String, dynamic>{},
      );
    }

    final Map<String, dynamic> details = (raw['details']
                as Map<Object?, Object?>? ??
            const <Object?, Object?>{})
        .map((Object? key, Object? value) => MapEntry(key.toString(), value));

    return PrinterOperationResult(
      ok: raw['ok'] == true,
      code: (raw['code'] ?? 'ProtocolError').toString(),
      message: (raw['message'] ?? '').toString(),
      details: details,
    );
  }
}

class BluetoothDevice {
  BluetoothDevice({
    required this.name,
    required this.address,
  });

  late String name;
  late String address;

  BluetoothDevice.fromString(String value) {
    final List<String> split = value.split('#');
    name = split.first;
    address = split.length > 1 ? split[1] : '';
  }

  BluetoothDevice.fromMap(Map<String, dynamic> map) {
    name = map['name'] as String;
    address = map['address'] as String;
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'name': name,
      'address': address,
    };
  }
}

class PrintData {
  PrintData({
    required this.data,
    required this.width,
    required this.height,
    required this.rotate,
    required this.invertColor,
    required this.density,
    required this.labelType,
    this.bitOrder,
    this.invertPackedBits,
  });

  late List<int> data;
  late int width;
  late int height;
  late bool rotate;
  late bool invertColor;
  late int density;
  late int labelType;
  String? bitOrder;
  bool? invertPackedBits;

  PrintData.fromMap(Map<String, dynamic> map) {
    data = map['bytes'] as List<int>;
    width = map['width'] as int;
    height = map['height'] as int;
    rotate = map['rotate'] as bool;
    invertColor = map['invertColor'] as bool;
    density = map['density'] as int;
    labelType = map['labelType'] as int;
    bitOrder = map['bitOrder'] as String?;
    invertPackedBits = map['invertPackedBits'] as bool?;
  }

  Map<String, dynamic> toMap() {
    final List<int> bytes =
        data is Uint8List ? (data as Uint8List).toList() : data;
    return <String, dynamic>{
      'bytes': bytes,
      'width': width,
      'height': height,
      'rotate': rotate,
      'invertColor': invertColor,
      'density': density,
      'labelType': labelType,
      if (bitOrder != null) 'bitOrder': bitOrder,
      if (invertPackedBits != null) 'invertPackedBits': invertPackedBits,
    };
  }
}
