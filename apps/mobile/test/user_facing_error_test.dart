import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:sofortbot_mobile/user_facing_error.dart';

void main() {
  test('isNetworkUnavailableError recognizes network failures', () {
    expect(isNetworkUnavailableError(const SocketException('offline')), isTrue);
    expect(isNetworkUnavailableError(TimeoutException('slow backend')), isTrue);
    expect(
        isNetworkUnavailableError(
            const MobileAuthRefreshUnavailableException()),
        isTrue);
    expect(isNetworkUnavailableError(http.ClientException('connection failed')),
        isTrue);
    expect(isNetworkUnavailableError(Exception('validation failed')), isFalse);
  });
}
