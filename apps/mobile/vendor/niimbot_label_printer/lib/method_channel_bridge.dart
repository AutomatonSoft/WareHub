import 'package:flutter/services.dart';

class MethodChannelBridge {
  const MethodChannelBridge(this._channel);

  final MethodChannel _channel;

  Future<T?> invoke<T>(String method, [Object? arguments]) {
    return _channel.invokeMethod<T>(method, arguments);
  }
}
