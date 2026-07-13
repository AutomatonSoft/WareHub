import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

class UserFacingError implements Exception {
  const UserFacingError(this.message);

  final String message;

  @override
  String toString() => message;
}

class MobileAuthRefreshUnavailableException implements Exception {
  const MobileAuthRefreshUnavailableException();

  @override
  String toString() => 'auth refresh is temporarily unavailable';
}

bool isNetworkUnavailableError(Object error) {
  if (error is SocketException ||
      error is TimeoutException ||
      error is MobileAuthRefreshUnavailableException ||
      error is http.ClientException) {
    return true;
  }

  final String normalized = error.toString().toLowerCase();
  return normalized.contains('socketexception') ||
      normalized.contains('failed host lookup') ||
      normalized.contains('network is unreachable') ||
      normalized.contains('connection failed') ||
      normalized.contains('connection refused') ||
      normalized.contains('connection timed out') ||
      normalized.contains('operation timed out');
}
