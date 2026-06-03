// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageCore on _QrHomePageState {
  String _effectiveApiBase() {
    final AppSettings settings = AppSettingsScope.of(context);
    return normalizeApiBase(settings.apiBaseUrl);
  }

  String _authToken() {
    final AppSettings settings = AppSettingsScope.of(context);
    return settings.authToken.trim();
  }

  Map<String, String> _authHeaders({bool json = false}) {
    final Map<String, String> headers = <String, String>{};
    if (json) {
      headers['Content-Type'] = 'application/json';
    }
    final String token = _authToken();
    if (token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<void> _handleUnauthorized() async {
    if (!mounted) {
      return;
    }
    final AppSettings settings = AppSettingsScope.of(context);
    await settings.clearSession();
    configureMobileLogAuthToken('');
    _eventsReconnectEnabled = false;
    _eventsReconnectTimer?.cancel();
    _eventsSubscription?.cancel();
    _eventsChannel?.sink.close();
    if (!mounted) {
      return;
    }
    _showMessage(_strings.text('session_expired_login_again'), error: true);
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
  }

  List<GroupedIntakeData> _groupedItems() {
    final Map<String, List<IntakeData>> buckets = <String, List<IntakeData>>{};
    for (final IntakeData item in _items) {
      // Group by product identity + status, across all warehouse locations.
      final String normalizedProductKey = item.productKey.trim().toUpperCase();
      final String normalizedKid = item.kidNumber.trim().toUpperCase();
      final String normalizedQr = item.qrCode.trim().toUpperCase();
      final String rootIdentity = normalizedProductKey.isNotEmpty
          ? 'PK:$normalizedProductKey'
          : 'KQ:$normalizedKid|$normalizedQr';
      final String key = <String>[
        rootIdentity,
        item.isBWare ? 'bware' : 'regular',
        item.isRemoved ? 'removed' : 'active',
      ].join('|');
      buckets.putIfAbsent(key, () => <IntakeData>[]).add(item);
    }

    final List<GroupedIntakeData> grouped = <GroupedIntakeData>[];
    for (final List<IntakeData> group in buckets.values) {
      group.sort(
        (IntakeData a, IntakeData b) =>
            DateTime.parse(b.createdAt).compareTo(DateTime.parse(a.createdAt)),
      );
      final IntakeData representative = group.first;
      final int partsCount = group
          .map((IntakeData item) => item.boxTotal)
          .fold<int>(1, (a, b) => a > b ? a : b);
      final int count =
          group.map((IntakeData item) => item.unitIndex).toSet().length;
      final List<String> warehouseLocations = group
          .map((IntakeData item) => item.warehouseLocation.trim().toUpperCase())
          .where((String value) => value.isNotEmpty)
          .toSet()
          .toList(growable: false)
        ..sort();
      grouped.add(
        GroupedIntakeData(
          representative: representative,
          partsCount: partsCount,
          count: count,
          warehouseLocations: warehouseLocations,
        ),
      );
    }
    grouped.sort(
      (GroupedIntakeData a, GroupedIntakeData b) =>
          DateTime.parse(b.representative.createdAt)
              .compareTo(DateTime.parse(a.representative.createdAt)),
    );
    return grouped;
  }

  String? _resolveKidNumber(ParsedQrData parsed) {
    final String? first = parsed.kidNumber?.trim();
    if (first != null && first.isNotEmpty) {
      return first;
    }
    final String? second = parsed.kidNumber2?.trim();
    if (second != null && second.isNotEmpty) {
      return second;
    }
    return null;
  }

  Uri _wsUri() {
    final Uri base = Uri.parse(_effectiveApiBase());
    final String scheme = base.scheme == 'https' ? 'wss' : 'ws';
    return base.replace(
      scheme: scheme,
      path: '/api/v1/intakes/ws',
      queryParameters: null,
      fragment: '',
    );
  }

  Iterable<String>? _wsProtocols() {
    final String token = _authToken();
    if (token.isEmpty) {
      return null;
    }
    return <String>['auth.$token'];
  }

  List<String> _photoUrlsFromField(String? value) {
    final String raw = (value ?? '').trim();
    if (raw.isEmpty) {
      return const <String>[];
    }
    if (raw.startsWith('[')) {
      try {
        final dynamic decoded = jsonDecode(raw);
        if (decoded is List) {
          return decoded
              .whereType<String>()
              .map((item) => item.trim())
              .where((item) => item.isNotEmpty)
              .map(_resolveMediaUrl)
              .toList(growable: false);
        }
      } catch (_) {
        // Ignore malformed JSON and fallback to delimiter parsing below.
      }
    }
    return raw
        .split(RegExp(r'[,;\n\r]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .map(_resolveMediaUrl)
        .toList(growable: false);
  }

  String _resolveMediaUrl(String rawUrl) {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    if (!rawUrl.startsWith('/')) {
      return rawUrl;
    }
    final Uri base = Uri.parse(_effectiveApiBase());
    return base.resolve(rawUrl).toString();
  }

  Future<void> _loadInitialIntakes() async {
    setState(() {
      _loadingList = true;
    });

    try {
      final Uri url = Uri.parse('${_effectiveApiBase()}/intakes?limit=200');
      final http.Response response = await http.get(
        url,
        headers: _authHeaders(),
      );
      if (response.statusCode == 401) {
        await _handleUnauthorized();
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        _showMessage(
            _strings.format(
              'load_list_failed_http',
              <String, String>{'code': '${response.statusCode}'},
            ),
            error: true);
        return;
      }

      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! List) {
        _showMessage(_strings.text('load_list_invalid'), error: true);
        return;
      }

      final List<IntakeData> loaded = decoded
          .whereType<Map<String, dynamic>>()
          .map(IntakeData.fromJson)
          .toList();

      if (!mounted) {
        return;
      }
      setState(() {
        _items
          ..clear()
          ..addAll(loaded);
      });
      _prefetchOrderMemosForItems(loaded);
    } catch (error) {
      _showMessage(
        _strings.format('load_list_error', <String, String>{
          'error': '$error',
        }),
        error: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _loadingList = false;
        });
      }
    }
  }

  void _connectEvents() {
    if (!_eventsReconnectEnabled || _authToken().isEmpty) {
      return;
    }
    _eventsReconnectTimer?.cancel();
    _eventsSubscription?.cancel();
    _eventsChannel?.sink.close();

    final Uri uri = _wsUri();
    final WebSocketChannel channel = WebSocketChannel.connect(
      uri,
      protocols: _wsProtocols(),
    );
    _eventsChannel = channel;
    _eventsSubscription = channel.stream.listen(
      (dynamic message) {
        try {
          final dynamic decoded = jsonDecode(message as String);
          if (decoded is! Map<String, dynamic>) {
            return;
          }
          final IntakeWsEvent event = IntakeWsEvent.fromJson(decoded);
          if (event.kind == 'intake_updated' && event.intake != null) {
            _upsertItem(event.intake!);
            return;
          }
          if (event.kind == 'intake_deleted') {
            final String? id = event.intakeId ?? event.intake?.id;
            if (id != null && id.isNotEmpty) {
              _removeItemById(id);
            }
            return;
          }
          if (event.kind == 'intake_created' && event.intake != null) {
            _upsertItem(event.intake!);
          }
        } catch (_) {
          // ignore invalid ws payloads
        }
      },
      onError: (_) {
        _scheduleEventsReconnect();
      },
      onDone: () {
        _scheduleEventsReconnect();
      },
      cancelOnError: false,
    );
  }

  void _scheduleEventsReconnect() {
    if (!_eventsReconnectEnabled) {
      return;
    }
    _eventsReconnectTimer?.cancel();
    _eventsReconnectTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted || !_eventsReconnectEnabled) {
        return;
      }
      _connectEvents();
    });
  }

  Future<String?> _scanRawQr() {
    return Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => const QrScannerPage(),
      ),
    );
  }

  Future<IntakeData> _createIntake({
    ParsedQrData? parsed,
    String? rawQrCode,
    String? kidNumberOverride,
    String? productKey,
    String? productColor,
    bool isBWare = false,
    String? bWareComment,
    String? categoryMain,
    String? categorySub,
    String? warehouseLocation,
    String? placementSection,
    String? photoUrl,
    required int boxTotal,
    required String placementStrategy,
  }) async {
    final String? kidNumber = (kidNumberOverride ?? '').trim().isNotEmpty
        ? kidNumberOverride?.trim()
        : (parsed == null ? null : _resolveKidNumber(parsed));
    if (kidNumber == null) {
      throw UserFacingError(_strings.text('error_kid_missing'));
    }
    final String qrCode = (rawQrCode ?? parsed?.raw ?? '').trim();
    if (qrCode.isEmpty) {
      throw UserFacingError(_strings.text('error_qr_required'));
    }

    final Uri url = Uri.parse('${_effectiveApiBase()}/intakes');
    final Map<String, dynamic> body = <String, dynamic>{
      'qr_code': qrCode,
      'kid_number': kidNumber,
      'box_total': boxTotal,
      'placement_strategy': placementStrategy,
    };
    final String? normalizedPlacementSection =
        placementSection?.trim().toUpperCase();
    if (normalizedPlacementSection != null &&
        normalizedPlacementSection.isNotEmpty) {
      body['placement_section'] = normalizedPlacementSection;
    }
    final String? normalizedProductKey = productKey?.trim();
    if (normalizedProductKey != null && normalizedProductKey.isNotEmpty) {
      body['product_key'] = normalizedProductKey;
    }
    final String? normalizedColor = productColor?.trim();
    if (normalizedColor != null && normalizedColor.isNotEmpty) {
      body['product_color'] = normalizedColor;
    }
    body['is_b_ware'] = isBWare;
    final String? normalizedBWareComment = bWareComment?.trim();
    if (normalizedBWareComment != null && normalizedBWareComment.isNotEmpty) {
      body['b_ware_comment'] = normalizedBWareComment;
    }
    final String? normalizedCategoryMain = categoryMain?.trim();
    if (normalizedCategoryMain != null && normalizedCategoryMain.isNotEmpty) {
      body['category_main'] = normalizedCategoryMain;
    }
    final String? normalizedCategorySub = categorySub?.trim();
    if (normalizedCategorySub != null && normalizedCategorySub.isNotEmpty) {
      body['category_sub'] = normalizedCategorySub;
    }
    final String? normalizedWarehouseLocation = warehouseLocation?.trim();
    if (normalizedWarehouseLocation != null &&
        normalizedWarehouseLocation.isNotEmpty) {
      body['warehouse_location'] = normalizedWarehouseLocation;
    }
    final String? normalizedPhotoUrl = photoUrl?.trim();
    if (normalizedPhotoUrl != null && normalizedPhotoUrl.isNotEmpty) {
      body['photo_url'] = normalizedPhotoUrl;
    }

    final http.Response response = await http.post(
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(body),
    );

    if (response.statusCode == 401) {
      await _handleUnauthorized();
      throw UserFacingError(_strings.text('create_intake_failed_unauthorized'));
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String details = '';
      try {
        final dynamic decodedError = jsonDecode(response.body);
        if (decodedError is Map<String, dynamic>) {
          final dynamic message = decodedError['message'];
          if (message is String && message.isNotEmpty) {
            details = message;
          }
        }
      } catch (_) {}

      throw UserFacingError(
        buildCreateIntakeErrorMessage(
          strings: _strings,
          statusCode: response.statusCode,
          details: details,
        ),
      );
    }

    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw UserFacingError(_strings.text('create_intake_response_invalid'));
    }

    return IntakeData.fromJson(decoded);
  }

  Future<IntakeData> _updateIntakePhoto({
    required String intakeId,
    String? photoUrl,
  }) async {
    final Uri url = Uri.parse('${_effectiveApiBase()}/intakes/$intakeId/photo');
    final Map<String, dynamic> body = <String, dynamic>{};
    final String? normalizedPhotoUrl = photoUrl?.trim();
    if (normalizedPhotoUrl != null && normalizedPhotoUrl.isNotEmpty) {
      body['photo_url'] = normalizedPhotoUrl;
    } else {
      body['photo_url'] = null;
    }

    final http.Response response = await http.patch(
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(body),
    );

    if (response.statusCode == 401) {
      await _handleUnauthorized();
      throw UserFacingError(_strings.text('create_intake_failed_unauthorized'));
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw UserFacingError(
        _strings.format(
          'create_intake_failed_http',
          <String, String>{'code': '${response.statusCode}'},
        ),
      );
    }

    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw UserFacingError(_strings.text('create_intake_response_invalid'));
    }
    return IntakeData.fromJson(decoded);
  }

  void _upsertItem(IntakeData item) {
    if (!mounted) {
      return;
    }
    setState(() {
      final int index = _items.indexWhere((it) => it.id == item.id);
      if (index >= 0) {
        _items[index] = item;
      } else {
        _items.insert(0, item);
      }
    });
    final String orderId = (parseQrData(item.qrCode).orderId ?? '').trim();
    if (orderId.isNotEmpty) {
      _ensureOrderMemoLoaded(orderId);
    }
  }

  void _removeItemById(String id) {
    if (!mounted) {
      return;
    }
    setState(() {
      _items.removeWhere((item) => item.id == id);
    });
  }

  void _showMessage(String message, {bool error = false}) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: error ? Colors.red.shade700 : null,
        ),
      );
  }
}
