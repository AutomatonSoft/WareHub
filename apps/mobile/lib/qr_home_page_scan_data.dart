// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

class _PhotoUploadFailure implements Exception {
  const _PhotoUploadFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

extension _QrHomePageScanData on _QrHomePageState {
  static const PhotoUploadRetryPolicy _photoUploadRetryPolicy =
      PhotoUploadRetryPolicy();

  String _photoUploadErrorMessage(Object error) {
    if (error is _PhotoUploadFailure) {
      return error.message;
    }
    return '$error';
  }

  String _extractUploadErrorBody(String body) {
    final String trimmed = body.trim();
    if (trimmed.isEmpty) {
      return '';
    }
    try {
      final dynamic decoded = jsonDecode(trimmed);
      if (decoded is Map<String, dynamic>) {
        final Object? detail = decoded['detail'] ??
            decoded['error'] ??
            decoded['message'] ??
            decoded['details'];
        final String message = '$detail'.trim();
        if (detail != null && message.isNotEmpty && message != 'null') {
          return message;
        }
      }
    } catch (_) {
      // Fall back to the raw response body below.
    }
    return trimmed.length > 240 ? '${trimmed.substring(0, 240)}...' : trimmed;
  }

  bool _shouldOfferManualPhotoRetry(String? failureDetail) {
    final String detail = (failureDetail ?? '').trim().toLowerCase();
    if (detail.isEmpty) {
      return true;
    }
    return !(detail.contains('http 500') ||
        detail.contains('http 502') ||
        detail.contains('http 503') ||
        detail.contains('database-service') ||
        detail.contains('ftp upload error') ||
        detail.contains('ftp config error') ||
        detail.contains('nodename nor servname'));
  }

  String _formatPhotoFolderContext(String? folder) {
    final String normalizedFolder = (folder ?? '').trim();
    if (normalizedFolder.isEmpty) {
      return 'folder=<empty>';
    }
    final ({String section, String warehouseLocation}) parsed =
        parseIntakePhotoFolder(normalizedFolder);
    return 'folder=$normalizedFolder section=${parsed.section} location=${parsed.warehouseLocation}';
  }

  Future<String?> _uploadPhotoWithSingleRetry(
    XFile file, {
    String? filename,
    String? folder,
  }) async {
    final String context = _formatPhotoFolderContext(folder);
    try {
      final String? firstTry = await _uploadPhotoAndGetUrl(
        file,
        filename: filename,
        folder: folder,
      );
      if ((firstTry ?? '').trim().isNotEmpty) {
        return firstTry;
      }
      debugPrint(
        'Photo upload first attempt returned empty url; retrying. '
        'name=${filename ?? ''} path=${file.path} $context',
      );
    } catch (error) {
      debugPrint(
        'Photo upload first attempt failed; retrying. '
        'name=${filename ?? ''} path=${file.path} $context error=$error',
      );
    }

    try {
      await Future<void>.delayed(
        Duration(milliseconds: _photoUploadRetryPolicy.delayMs),
      );
      return await _uploadPhotoAndGetUrl(
        file,
        filename: filename,
        folder: folder,
      );
    } catch (error) {
      debugPrint(
        'Photo upload retry failed. '
        'name=${filename ?? ''} path=${file.path} $context error=$error',
      );
      throw _PhotoUploadFailure(_photoUploadErrorMessage(error));
    }
  }

  Future<String?> _uploadPhotoAndGetUrl(
    XFile file, {
    String? filename,
    String? folder,
  }) async {
    final Map<String, String> params = <String, String>{'kind': 'product'};
    final String normalizedFilename = (filename ?? '').trim();
    if (normalizedFilename.isNotEmpty) {
      params['name'] = normalizedFilename;
    }
    final String normalizedFolder = (folder ?? '').trim();
    if (normalizedFolder.isNotEmpty) {
      params['folder'] = normalizedFolder;
    }
    final Uri url = Uri.parse('${_effectiveApiBase()}/uploads')
        .replace(queryParameters: params);
    Future<http.StreamedResponse> sendUploadOnce() async {
      final http.MultipartRequest request = http.MultipartRequest('POST', url);
      final String token = _authToken();
      if (token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      request.files.add(await http.MultipartFile.fromPath('file', file.path));
      return request.send();
    }

    http.StreamedResponse streamed = await sendUploadOnce();
    if (streamed.statusCode == 401 && await _refreshAuthSession()) {
      await streamed.stream.drain<void>();
      streamed = await sendUploadOnce();
    }
    final String body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      final String details = _extractUploadErrorBody(body);
      final String suffix = details.isEmpty ? '' : ': $details';
      throw _PhotoUploadFailure('HTTP ${streamed.statusCode}$suffix');
    }
    final dynamic decoded;
    try {
      decoded = jsonDecode(body);
    } catch (_) {
      throw const _PhotoUploadFailure('Invalid upload response JSON');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const _PhotoUploadFailure('Invalid upload response shape');
    }
    final String rawUrl = (decoded['url'] as String? ?? '').trim();
    if (rawUrl.isEmpty) {
      throw const _PhotoUploadFailure('Upload response returned empty URL');
    }
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    final Uri base = Uri.parse(_effectiveApiBase());
    return base.resolve(rawUrl).toString();
  }

  Future<String?> _uploadPhotosAndBuildField(
    List<XFile> photos, {
    String? filePrefix,
    String? folder,
  }) async {
    if (photos.isEmpty) {
      return null;
    }
    final List<String> uploaded = <String>[];
    final List<({XFile file, String filename})> failedPhotos =
        <({XFile file, String filename})>[];
    final int attempted = photos.take(10).length;
    int failed = 0;
    int failedInitial = 0;
    int recovered = 0;
    String? failureDetail;
    int photoIndex = 0;
    for (final XFile photo in photos.take(10)) {
      photoIndex += 1;
      final String candidateFilename = (filePrefix ?? '').trim().isEmpty
          ? ''
          : '${filePrefix!.trim()}_$photoIndex';
      try {
        final String? url = await _uploadPhotoWithSingleRetry(
          photo,
          filename: candidateFilename,
          folder: folder,
        );
        if (url == null || url.isEmpty) {
          failed += 1;
          failedInitial += 1;
          failureDetail ??= 'Upload returned empty URL';
          failedPhotos.add((file: photo, filename: candidateFilename));
          debugPrint(
            'Photo upload failed after retry. '
            'index=$photoIndex file=${photo.path} ${_formatPhotoFolderContext(folder)}',
          );
        } else {
          uploaded.add(url);
        }
      } catch (error) {
        failed += 1;
        failedInitial += 1;
        failureDetail ??= _photoUploadErrorMessage(error);
        failedPhotos.add((file: photo, filename: candidateFilename));
        debugPrint(
          'Unexpected photo upload error. '
          'index=$photoIndex file=${photo.path} ${_formatPhotoFolderContext(folder)} '
          'error=$error',
        );
      }
    }

    if (shouldAskManualRetry(failedCount: failedPhotos.length) &&
        _shouldOfferManualPhotoRetry(failureDetail)) {
      final bool shouldRetryFailedPhotos = await _askYesNo(
        title: _strings.text('photo_upload_retry_title'),
        message: _strings.format(
          'photo_upload_retry_body',
          <String, String>{'count': '${failedPhotos.length}'},
        ),
        yes: _strings.text('retry'),
        no: _strings.text('continue'),
      );

      if (shouldRetryFailedPhotos) {
        for (final ({XFile file, String filename}) failedPhoto
            in failedPhotos) {
          final String? retryUrl = await _uploadPhotoWithSingleRetry(
            failedPhoto.file,
            filename: failedPhoto.filename,
            folder: folder,
          ).catchError((Object error) {
            failureDetail ??= _photoUploadErrorMessage(error);
            return null;
          });
          if ((retryUrl ?? '').trim().isNotEmpty) {
            uploaded.add(retryUrl!.trim());
            recovered += 1;
          }
        }
        if (recovered > 0) {
          _showMessage(
            _strings.format(
              'photos_upload_recovered',
              <String, String>{'count': '$recovered'},
            ),
          );
        }
        failed = applyRecoveredCount(failed: failed, recovered: recovered);
      }
    }

    final PhotoUploadTelemetry telemetry = buildPhotoUploadTelemetry(
      attempted: attempted,
      failedInitial: failedInitial,
      recovered: recovered,
      failedFinal: failed,
    );
    debugPrint(
      'Photo upload telemetry ${formatPhotoUploadTelemetry(telemetry)} '
      '${_formatPhotoFolderContext(folder)}',
    );

    String? failureMessage;
    if (failed > 0) {
      final String details = (failureDetail ?? '').trim();
      final String baseMessage = _strings.format(
        'photos_upload_failed',
        <String, String>{'count': '$failed'},
      );
      failureMessage = details.isEmpty ? baseMessage : '$baseMessage $details';
    }
    if (failureMessage != null && uploaded.isNotEmpty) {
      _showMessage(
        failureMessage,
        error: true,
      );
    }
    if (uploaded.isEmpty) {
      if (failureMessage != null) {
        throw UserFacingError(failureMessage);
      }
      return null;
    }
    return uploaded.join(',');
  }

  void _prefetchOrderMemosForItems(Iterable<IntakeData> items) {
    final Set<String> orderIds = items
        .map((IntakeData item) =>
            (parseQrData(item.qrCode).orderId ?? '').trim())
        .where((String orderId) => orderId.isNotEmpty)
        .toSet();
    for (final String orderId in orderIds) {
      _ensureOrderMemoLoaded(orderId);
    }
  }

  void _ensureOrderMemoLoaded(String orderId) {
    if (_orderMemoById.containsKey(orderId) || _memoLoading.contains(orderId)) {
      return;
    }
    _memoLoading.add(orderId);
    _fetchAfterbuyMemo(orderId).then((String? memo) {
      if (!mounted) {
        return;
      }
      setState(() {
        if (memo != null && memo.trim().isNotEmpty) {
          _orderMemoById[orderId] = memo.trim();
        }
        _memoLoading.remove(orderId);
      });
    }).catchError((_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _memoLoading.remove(orderId);
      });
    });
  }

  Future<String?> _fetchAfterbuyMemo(String orderId) async {
    final Uri url = Uri.parse(
      '${_effectiveApiBase()}/afterbuy/orders/${Uri.encodeComponent(orderId)}',
    );
    final http.Response response = await _authorizedRequest(
      'GET',
      url,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }
    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      return null;
    }
    final dynamic rawMemo = decoded['memo'];
    if (rawMemo == null) {
      return null;
    }
    final String memo = '$rawMemo'.trim();
    return memo.isEmpty ? null : memo;
  }
}
