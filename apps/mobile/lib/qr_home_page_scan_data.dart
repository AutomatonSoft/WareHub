// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageScanData on _QrHomePageState {
  static const PhotoUploadRetryPolicy _photoUploadRetryPolicy =
      PhotoUploadRetryPolicy();

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
      return null;
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
    final http.MultipartRequest request = http.MultipartRequest('POST', url);
    final String token = _authToken();
    if (token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    request.files.add(await http.MultipartFile.fromPath('file', file.path));
    final http.StreamedResponse streamed = await request.send();
    final String body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      return null;
    }
    final dynamic decoded = jsonDecode(body);
    if (decoded is! Map<String, dynamic>) {
      return null;
    }
    final String rawUrl = (decoded['url'] as String? ?? '').trim();
    if (rawUrl.isEmpty) {
      return null;
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
        failedPhotos.add((file: photo, filename: candidateFilename));
        debugPrint(
          'Unexpected photo upload error. '
          'index=$photoIndex file=${photo.path} ${_formatPhotoFolderContext(folder)} '
          'error=$error',
        );
      }
    }

    if (shouldAskManualRetry(failedCount: failedPhotos.length)) {
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
          );
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

    if (failed > 0) {
      _showMessage(
        _strings.format('photos_upload_failed', <String, String>{
          'count': '$failed',
        }),
        error: true,
      );
    }
    if (uploaded.isEmpty) {
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
    final http.Response response = await http.get(
      url,
      headers: _authHeaders(),
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
