part of 'qr_home_page.dart';

class _AddFlowData {
  const _AddFlowData({
    required this.store,
    required this.category,
    required this.color,
    required this.inTransit,
    required this.isBWare,
    required this.bWareComment,
    required this.photos,
  });

  final bool store;
  final _CategorySelection category;
  final String? color;
  final bool inTransit;
  final bool isBWare;
  final String? bWareComment;
  final List<XFile> photos;
}

extension _QrHomePageAddFlow on _QrHomePageState {
  Future<_AddFlowData?> _collectAddFlowData() async {
    final AppStrings strings = _strings;

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final bool? store = await _askStoreDestinationSelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '4', 'total': '10'},
      ),
    );
    if (store == null) {
      return null;
    }

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final bool inTransit = await _askInTransitSelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '5', 'total': '10'},
      ),
    );

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final _CategorySelection? category = await _askCategorySelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '6', 'total': '10'},
      ),
    );
    if (category == null) {
      return null;
    }

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final String? color = await _askColorSelectionGerman(
      title: strings.format(
        'step_title',
        <String, String>{'step': '7', 'total': '10'},
      ),
    );

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final bool isBWare = await _askBWareSelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '8', 'total': '10'},
      ),
    );

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final String? bWareComment = await _askOptionalComment(
      title: strings.format(
        'step_title',
        <String, String>{'step': '9', 'total': '10'},
      ),
    );

    await _stabilizeUiAfterRouteTransition();
    if (!mounted) {
      return null;
    }

    final List<XFile> photos = await _capturePhotosUpTo10(step: 10, total: 10);

    return _AddFlowData(
      store: store,
      category: category,
      color: color,
      inTransit: inTransit,
      isBWare: isBWare,
      bWareComment: bWareComment,
      photos: photos,
    );
  }

  Future<IntakeData> _finalizeAddedIntake(
    IntakeData created,
    List<XFile> photos,
  ) async {
    IntakeData result = created;
    if (photos.isNotEmpty) {
      final String photoPrefix = '${result.unitIndex}';
      final String photoFolder =
          buildIntakePhotoFolder(result.section, result.warehouseLocation);
      final String? photoUrl = await _uploadPhotosAndBuildField(
        photos,
        filePrefix: photoPrefix,
        folder: photoFolder,
      );
      final String normalizedPhotoUrl = (photoUrl ?? '').trim();
      if (normalizedPhotoUrl.isEmpty) {
        throw UserFacingError(
          _strings.format('photos_upload_failed', <String, String>{
            'count': '${photos.length}',
          }),
        );
      }
      final String kidPhotoRef =
          result.databaseKidId > 0 ? '${result.databaseKidId}' : result.id;
      result = await _updateIntakePhoto(
        intakeId: kidPhotoRef,
        photoUrl: normalizedPhotoUrl,
      );
    }
    _upsertItem(result);

    await _printLabelForAddedItem(
      result.warehouseLocation,
      quantity: result.boxTotal,
      unitIndex: result.unitIndex,
      totalParts: result.boxTotal,
      sectionCode: result.section,
      slotNumber: result.slotNumber,
    );

    _showMessage(
      _strings.format('item_added', <String, String>{
        'location': result.warehouseLocation,
        'boxes': '${result.boxTotal}',
      }),
    );
    return result;
  }

  Future<List<String>?> _addPhotosToItem(IntakeData item) async {
    final int existingCount = _photoUrlsFromField(item.photoUrl).length;
    final int remaining = 10 - existingCount;
    if (remaining <= 0) {
      _showMessage(_strings.text('photos_limit_reached'), error: true);
      return null;
    }

    try {
      final List<XFile> photos = await _capturePhotosUpTo10(
        askToStart: false,
        maxCount: remaining,
      );
      if (photos.isEmpty) {
        return null;
      }

      final String photoPrefix =
          item.databaseKidId > 0 ? '${item.databaseKidId}' : item.id;
      final String photoFolder =
          buildIntakePhotoFolder(item.section, item.warehouseLocation);
      final String? newlyUploaded = await _uploadPhotosAndBuildField(
        photos,
        filePrefix: photoPrefix,
        folder: photoFolder,
      );
      final String normalizedNew = (newlyUploaded ?? '').trim();
      if (normalizedNew.isEmpty) {
        return null;
      }

      final String existingRaw = item.photoUrl.trim();
      final String combined =
          existingRaw.isEmpty ? normalizedNew : '$existingRaw,$normalizedNew';
      final String kidPhotoRef =
          item.databaseKidId > 0 ? '${item.databaseKidId}' : item.id;
      final IntakeData updated = await _updateIntakePhoto(
        intakeId: kidPhotoRef,
        photoUrl: combined,
      );
      _upsertItem(updated);
      _showMessage(
        _strings.format(
          'photos_added',
          <String, String>{'count': '${photos.length}'},
        ),
      );
      return _photoUrlsFromField(updated.photoUrl);
    } catch (error) {
      _showMessage(
        _messageForError(error, fallbackKey: 'action_failed_error'),
        error: true,
      );
      return null;
    }
  }
}
