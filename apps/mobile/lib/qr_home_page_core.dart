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
    print('TOKEN==============>>>>>>>>>> $token');
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

  Future<bool> _refreshAuthSession() async {
    final MobileAuthRefreshResult result = await _refreshAuthSessionDetailed();
    return result.refreshed;
  }

  Future<MobileAuthRefreshResult> _refreshAuthSessionDetailed() async {
    final AppSettings settings = AppSettingsScope.of(context);
    return refreshMobileAuthSessionDetailed(
      settings,
      apiBase: _effectiveApiBase(),
    );
  }

  Future<MobileAuthRefreshStatus> _handleUnauthorizedAfterRefresh() async {
    final MobileAuthRefreshResult refresh = await _refreshAuthSessionDetailed();
    if (refresh.refreshed) {
      return refresh.status;
    }
    if (refresh.isTemporarilyUnavailable) {
      _showMessage(_strings.text('network_unavailable'), error: true);
      return refresh.status;
    }
    await _handleUnauthorized();
    return refresh.status;
  }

  String _messageForError(Object error, {required String fallbackKey}) {
    if (isNetworkUnavailableError(error)) {
      return _strings.text('network_unavailable');
    }
    if (error is UserFacingError) {
      return error.message;
    }
    return _strings.format(fallbackKey, <String, String>{'error': '$error'});
  }

  Future<http.Response> _authorizedRequest(
    String method,
    Uri url, {
    Map<String, String>? headers,
    String? body,
  }) {
    final AppSettings settings = AppSettingsScope.of(context);
    print('URL =====>>>>>>>>>> $url');
    return mobileAuthorizedRequest(
      settings,
      method,
      url,
      headers: headers,
      body: body,
    );
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
        ..sort(compareWarehousePlaces);
      grouped.add(
        GroupedIntakeData(
          representative: representative,
          partsCount: partsCount,
          count: count,
          warehouseLocations: warehouseLocations,
        ),
      );
    }
    grouped.sort((GroupedIntakeData a, GroupedIntakeData b) {
      final IntakeData left = a.representative;
      final IntakeData right = b.representative;
      final String leftPlace = a.warehouseLocations.isNotEmpty
          ? a.warehouseLocations.first
          : left.warehouseLocation;
      final String rightPlace = b.warehouseLocations.isNotEmpty
          ? b.warehouseLocations.first
          : right.warehouseLocation;
      final int sectionOrder =
          compareWarehouseSections(left.section, right.section);
      if (sectionOrder != 0) return sectionOrder;
      final int placeOrder = compareWarehousePlaces(leftPlace, rightPlace);
      if (placeOrder != 0) return placeOrder;
      return left.databaseKidId.compareTo(right.databaseKidId);
    });
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

  void _onFeedScroll() {
    if (!_feedScrollController.hasClients ||
        _loadingList ||
        _loadingMoreList ||
        !_inventoryHasMore) {
      return;
    }
    final ScrollPosition position = _feedScrollController.position;
    if (position.pixels >= position.maxScrollExtent - 420) {
      unawaited(_loadNextInventoryPage());
    }
  }

  Future<void> _loadInitialIntakes() async {
    await _loadInventoryPage(
      reset: true,
      queryRevision: _inventoryQueryRevision,
    );
  }

  Future<void> _loadNextInventoryPage() async {
    if (!_inventoryHasMore || _loadingList || _loadingMoreList) {
      return;
    }
    await _loadInventoryPage(
      reset: false,
      queryRevision: _inventoryQueryRevision,
    );
  }

  Future<void> _loadInventoryPage({
    required bool reset,
    required int queryRevision,
  }) async {
    setState(() {
      if (reset) {
        _loadingList = true;
        _inventoryNextOffset = 0;
        _inventoryHasMore = true;
      } else {
        _loadingMoreList = true;
      }
    });

    try {
      final int offset = reset ? 0 : _inventoryNextOffset;
      final http.Response response = await _authorizedRequest(
        'GET',
        _inventoryRowsUri(offset),
      );
      if (queryRevision != _inventoryQueryRevision) {
        return;
      }
      if (response.statusCode == 401) {
        final MobileAuthRefreshStatus status =
            await _handleUnauthorizedAfterRefresh();
        if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
          throw const MobileAuthRefreshUnavailableException();
        }
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
      print("=================>>>>>>>> $decoded");
      if (decoded is! Map<String, dynamic>) {
        _showMessage(_strings.text('load_list_invalid'), error: true);
        return;
      }
      final dynamic rawItems = decoded['items'];
      if (rawItems is! List) {
        _showMessage(_strings.text('load_list_invalid'), error: true);
        return;
      }

      final List<Map<String, dynamic>> rawItemMaps =
          rawItems.whereType<Map<String, dynamic>>().toList();
      final List<IntakeData> loaded =
          rawItemMaps.map(IntakeData.fromJson).toList();
      for (var i = 0; i < loaded.length; i++) {
        print(
          'in_stock raw=${rawItemMaps[i]['in_stock']} '
          '(${rawItemMaps[i]['in_stock'].runtimeType}) '
          'parsed=${loaded[i].inStock} id=${loaded[i].id}',
        );
      }
      final int? totalCount = _jsonInt(decoded['count']);
      final int? nextOffset = _jsonInt(decoded['next_offset']);
      final bool hasMore = decoded['has_more'] as bool? ?? false;

      if (!mounted || queryRevision != _inventoryQueryRevision) {
        return;
      }
      setState(() {
        if (reset) {
          _items
            ..clear()
            ..addAll(loaded);
        } else {
          final Set<String> existingIds =
              _items.map((IntakeData item) => item.id).toSet();
          _items.addAll(
            loaded.where((IntakeData item) => !existingIds.contains(item.id)),
          );
        }
        _inventoryTotalCount = totalCount ?? _items.length;
        _inventoryHasMore = hasMore;
        _inventoryNextOffset = nextOffset ?? _items.length;
      });
      _prefetchOrderMemosForItems(loaded);
    } catch (error) {
      if (queryRevision != _inventoryQueryRevision) {
        return;
      }
      _showMessage(
        isNetworkUnavailableError(error)
            ? _strings.text('network_unavailable_load')
            : _strings.format('load_list_error', <String, String>{
                'error': '$error',
              }),
        error: true,
      );
    } finally {
      if (mounted && queryRevision == _inventoryQueryRevision) {
        setState(() {
          if (reset) {
            _loadingList = false;
          } else {
            _loadingMoreList = false;
          }
        });
      }
    }
  }

  Uri _inventoryRowsUri(int offset) {
    final Map<String, String> query = <String, String>{
      'limit': '${_QrHomePageState._inventoryPageSize}',
      'offset': '$offset',
    };
    if (_inventorySearch.isNotEmpty) query['q'] = _inventorySearch;
    if (_inventoryPlace != null) query['place'] = _inventoryPlace!;
    if (_inventorySection != null) {
      query['section'] = normalizeWarehouseSection(_inventorySection!);
    }
    if (_inventoryQuantity != null) query['quantity'] = _inventoryQuantity!;
    if (_inventoryRoom != null) query['room'] = _inventoryRoom!;
    if (_inventoryType != null) query['type'] = _inventoryType!;
    if (_inventoryCompany != null) query['company'] = _inventoryCompany!;
    if (_inventoryColor != null) query['color'] = _inventoryColor!;
    if (_inventoryMaterial != null) query['material'] = _inventoryMaterial!;
    if (_inventoryDestination != null) {
      query['location'] =
          _inventoryDestination == InventoryDestinationFilter.store
              ? 'store'
              : 'warehouse';
    }
    if (_inventoryBWare != null) query['b_ware'] = _inventoryBWare.toString();
    if (_inventoryInTransit != null) {
      query['in_transit'] = _inventoryInTransit.toString();
    }
    return Uri.parse('${_effectiveApiBase()}/inventory/rows')
        .replace(queryParameters: query);
  }

  int get _activeInventoryFilterCount => <Object?>[
        _inventoryPlace,
        _inventorySection,
        _inventoryQuantity,
        _inventoryRoom,
        _inventoryType,
        _inventoryCompany,
        _inventoryColor,
        _inventoryMaterial,
        _inventoryDestination,
        _inventoryBWare,
        _inventoryInTransit,
      ].whereType<Object>().length;

  Future<void> _loadInventoryFilterOptions() async {
    final http.Response response = await _authorizedRequest(
      'GET',
      Uri.parse('${_effectiveApiBase()}/inventory/filter-options'),
      headers: _authHeaders(),
    );
    if (response.statusCode == 401 || response.statusCode == 403) {
      await _handleUnauthorizedAfterRefresh();
      return;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException('HTTP ${response.statusCode}');
    }
    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid inventory filter options');
    }
    if (!mounted) return;
    setState(() {
      _inventoryFilterOptions = InventoryFilterOptions.fromJson(decoded);
    });
  }

  Future<void> _submitInventorySearch(String value) async {
    _inventorySearchDebounceTimer?.cancel();
    final String search = value.trim();
    if (search == _inventorySearch) return;
    setState(() {
      _inventorySearch = search;
      _inventoryQueryRevision++;
    });
    await _loadInitialIntakes();
  }

  void _onInventorySearchChanged(String value) {
    _inventorySearchDebounceTimer?.cancel();
    if (value.trim() == _inventorySearch) {
      return;
    }
    _inventorySearchDebounceTimer = Timer(
      const Duration(milliseconds: 250),
      () => unawaited(_submitInventorySearch(value)),
    );
  }

  Future<void> _clearInventorySearch() async {
    if (_inventorySearch.isEmpty) return;
    _inventorySearchDebounceTimer?.cancel();
    _inventorySearchController.clear();
    setState(() {
      _inventorySearch = '';
      _inventoryQueryRevision++;
    });
    await _loadInitialIntakes();
  }

  Future<void> _applyInventoryFilters({
    required String? place,
    required String? section,
    required String? quantity,
    required String? room,
    required String? type,
    required String? company,
    required String? color,
    required String? material,
    required InventoryDestinationFilter? destination,
    required bool? bWare,
    required bool? inTransit,
  }) async {
    setState(() {
      _inventoryPlace = place;
      final String normalizedSection = normalizeWarehouseSection(section ?? '');
      _inventorySection = normalizedSection.isEmpty ? null : normalizedSection;
      _inventoryQuantity = quantity;
      _inventoryRoom = room;
      _inventoryType = type;
      _inventoryCompany = company;
      _inventoryColor = color;
      _inventoryMaterial = material;
      _inventoryDestination = destination;
      _inventoryBWare = bWare;
      _inventoryInTransit = inTransit;
      _inventoryQueryRevision++;
    });
    await _loadInitialIntakes();
  }

  int? _jsonInt(dynamic value) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value);
    }
    return null;
  }

  Future<void> _connectEvents({bool refreshBeforeConnect = false}) async {
    if (!_eventsReconnectEnabled) {
      return;
    }
    if (_authToken().isEmpty) {
      final MobileAuthRefreshResult refresh =
          await _refreshAuthSessionDetailed();
      if (!refresh.refreshed) {
        return;
      }
    }
    if (!mounted) {
      return;
    }
    final AppSettings settings = AppSettingsScope.of(context);
    if (refreshBeforeConnect && settings.refreshToken.trim().isNotEmpty) {
      await _refreshAuthSession();
    }
    if (!mounted) {
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
        _scheduleEventsReconnect(refreshBeforeConnect: true);
      },
      onDone: () {
        _scheduleEventsReconnect(refreshBeforeConnect: true);
      },
      cancelOnError: false,
    );
  }

  void _scheduleEventsReconnect({bool refreshBeforeConnect = false}) {
    if (!_eventsReconnectEnabled) {
      return;
    }
    _eventsReconnectTimer?.cancel();
    _eventsReconnectTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted || !_eventsReconnectEnabled) {
        return;
      }
      unawaited(_connectEvents(refreshBeforeConnect: refreshBeforeConnect));
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
    required bool store,
    required bool inTransit,
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

    final Uri url = Uri.parse('${_effectiveApiBase()}/inventory/kids');
    final Map<String, dynamic> body = <String, dynamic>{
      'qr_code': qrCode,
      'kid_number': kidNumber,
      'box_total': boxTotal,
      'placement_strategy': placementStrategy,
      'store': store,
      'in_transit': inTransit,
    };
    final String? normalizedPlacementSection = placementSection == null
        ? null
        : normalizeWarehouseSection(placementSection);
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
    final String? normalizedWarehouseLocation = warehouseLocation == null
        ? null
        : normalizeWarehouseLocation(warehouseLocation);
    if (normalizedWarehouseLocation != null &&
        normalizedWarehouseLocation.isNotEmpty) {
      body['warehouse_location'] = normalizedWarehouseLocation;
    }
    final String? normalizedPhotoUrl = photoUrl?.trim();
    if (normalizedPhotoUrl != null && normalizedPhotoUrl.isNotEmpty) {
      body['photo_url'] = normalizedPhotoUrl;
    }

    final http.Response response = await _authorizedRequest(
      'POST',
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(body),
    );

    if (response.statusCode == 401) {
      final MobileAuthRefreshStatus status =
          await _handleUnauthorizedAfterRefresh();
      if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
        throw const MobileAuthRefreshUnavailableException();
      }
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
    final Uri url =
        Uri.parse('${_effectiveApiBase()}/inventory/kids/$intakeId/photo');
    final Map<String, dynamic> body = <String, dynamic>{};
    final String? normalizedPhotoUrl = photoUrl?.trim();
    if (normalizedPhotoUrl != null && normalizedPhotoUrl.isNotEmpty) {
      body['photo_url'] = normalizedPhotoUrl;
    } else {
      body['photo_url'] = null;
    }

    final http.Response response = await _authorizedRequest(
      'PATCH',
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(body),
    );

    if (response.statusCode == 401) {
      final MobileAuthRefreshStatus status =
          await _handleUnauthorizedAfterRefresh();
      if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
        throw const MobileAuthRefreshUnavailableException();
      }
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
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 56),
        ),
      );
  }
}
