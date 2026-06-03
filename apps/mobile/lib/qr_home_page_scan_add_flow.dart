part of 'qr_home_page.dart';

class _AddFlowData {
  const _AddFlowData({
    required this.category,
    required this.color,
    required this.isBWare,
    required this.bWareComment,
    required this.photos,
  });

  final _CategorySelection category;
  final String? color;
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

    final _CategorySelection? category = await _askCategorySelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '4', 'total': '8'},
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
        <String, String>{'step': '5', 'total': '8'},
      ),
    );

    final bool isBWare = await _askBWareSelection(
      title: strings.format(
        'step_title',
        <String, String>{'step': '6', 'total': '8'},
      ),
    );

    final String? bWareComment = await _askOptionalComment(
      title: strings.format(
        'step_title',
        <String, String>{'step': '7', 'total': '8'},
      ),
    );
    final List<XFile> photos = await _capturePhotosUpTo10(step: 8, total: 8);

    return _AddFlowData(
      category: category,
      color: color,
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
      if ((photoUrl ?? '').trim().isNotEmpty) {
        result = await _updateIntakePhoto(
          intakeId: result.id,
          photoUrl: photoUrl,
        );
      }
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
}

