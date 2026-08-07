import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';
import 'inventory_item_display.dart';
import 'models.dart';
import 'warehouse_constants.dart';
import 'warehouse_location_utils.dart';

const String _palletFallbackAsset = 'assets/images/pallet.png';
const String _productFallbackAsset = 'assets/images/blank.png';

class QrHomeItemCard extends StatelessWidget {
  const QrHomeItemCard({
    super.key,
    required this.item,
    required this.photoUrls,
    required this.partsCount,
    required this.count,
    required this.warehouseLocations,
    this.memo,
    this.bWareComment,
    required this.printing,
    required this.onPrint,
    required this.onOpenDetails,
  });

  final IntakeData item;
  final List<String> photoUrls;
  final int partsCount;
  final int count;
  final List<String> warehouseLocations;
  final String? memo;
  final String? bWareComment;
  final bool printing;
  final Future<void> Function()? onPrint;
  final VoidCallback onOpenDetails;

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    final bool removed = item.isRemoved;
    final InventoryItemDisplayData display = InventoryItemDisplayData.fromItem(
      item: item,
      warehouseLocations: warehouseLocations,
      strings: strings,
    );
    final bool hasMultipleLocations = warehouseLocations.length > 1;
    final Color background = removed ? uiCardSoft : uiCard;
    final Color countChipBackground = removed
        ? uiOrangeDeep.withValues(alpha: 0.20)
        : hasMultipleLocations
            ? uiBrandGreen.withValues(alpha: 0.18)
            : uiBrandGreenSoft;
    final Color countChipForeground = removed ? uiOrangeDeep : uiNavy;
    final Color statusBarColor =
        removed ? uiOrangeDeep.withValues(alpha: 0.72) : uiBrandGreen;
    final Color borderColor =
        removed ? uiOrangeDeep.withValues(alpha: 0.72) : uiBrandGreen;
    final Color removedActionBackground = uiOrangeDeep.withValues(alpha: 0.10);
    final Color removedActionBorder = uiOrangeDeep.withValues(alpha: 0.72);

    return Semantics(
      button: true,
      label: '${strings.text('product_details')}: ${display.title}',
      child: Material(
        color: background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: borderColor, width: 1.2),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpenDetails,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: statusBarColor,
                  ),
                ),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        display.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: uiText,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    if (count > 1) ...<Widget>[
                      const SizedBox(width: 8),
                      Chip(
                        label: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            if (hasMultipleLocations) ...<Widget>[
                              Icon(
                                Icons.location_on_outlined,
                                size: 14,
                                color: countChipForeground,
                              ),
                              const SizedBox(width: 4),
                            ],
                            Text(
                              '${strings.text('count')}: $count',
                              style: TextStyle(color: countChipForeground),
                            ),
                          ],
                        ),
                        backgroundColor: countChipBackground,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                    if (removed) ...<Widget>[
                      const SizedBox(width: 8),
                      Container(
                        height: 40,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: removedActionBackground,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: removedActionBorder,
                            width: 1.2,
                          ),
                        ),
                        child: Text(
                          strings.text('removed'),
                          style: const TextStyle(
                            color: uiOrangeDeep,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (photoUrls.isNotEmpty) ...<Widget>[
                      _buildPhotoThumbnail(context, photoUrls.first, size: 120),
                      const SizedBox(width: 12),
                    ] else ...<Widget>[
                      _buildAssetPhotoThumbnail(
                        context,
                        display.fallbackAssetPath,
                        size: 120,
                      ),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            '${strings.text('kid')}: ${display.kidNumber}',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('section_slot')}: ${warehouseSectionLabel(item.section)} / ${item.slotNumber}',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('product_key')}: ${display.productKey}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('location')}: ${item.store ? strings.text('store_destination_store') : strings.text('store_destination_warehouse')}',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('count')}: $count',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('boxes')}: $partsCount',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('b_ware')}: ${item.isBWare ? strings.text('yes') : strings.text('no')}',
                            style: const TextStyle(color: uiMuted),
                          ),
                          Text(
                            '${strings.text('in_transit')}: ${item.inTransit ? strings.text('yes') : strings.text('no')}',
                            style: const TextStyle(color: uiMuted),
                          ),
                          if ((memo ?? '').trim().isNotEmpty)
                            Text(
                              '${strings.text('memo')}: ${memo!.trim()}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: uiMuted),
                            ),
                          if ((bWareComment ?? '').trim().isNotEmpty)
                            Text(
                              '${strings.text('b_ware_comment')}: ${bWareComment!.trim()}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: uiMuted),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton.tonalIcon(
                    onPressed: onPrint == null ? null : () => onPrint!(),
                    icon: printing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.print_outlined),
                    label: Text(strings.text('print')),
                    style: FilledButton.styleFrom(
                      foregroundColor: removed ? uiOrangeDeep : uiText,
                      backgroundColor:
                          removed ? removedActionBackground : uiCardSoft,
                      minimumSize: const Size(0, 40),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w700,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: removed
                              ? removedActionBorder
                              : Colors.transparent,
                          width: removed ? 1.2 : 0,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            height: 4,
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: statusBarColor,
            ),
          ),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  displayTitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: uiText,
                    fontSize: 15,
                  ),
                ),
              ),
              if (count > 1) ...<Widget>[
                const SizedBox(width: 8),
                InventoryCountChip(
                  label: strings.text('count'),
                  count: count,
                  backgroundColor: countChipBackground,
                  foregroundColor: countChipForeground,
                ),
              ],
              if (removed) ...<Widget>[
                const SizedBox(width: 8),
                Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: removedActionBackground,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: removedActionBorder,
                      width: 1.2,
                    ),
                  ),
                  child: Text(
                    strings.text('removed'),
                    style: const TextStyle(
                      color: uiOrangeDeep,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (photoUrls.isNotEmpty) ...<Widget>[
                _buildPhotoThumbnail(context, photoUrls.first, size: 120),
                const SizedBox(width: 12),
              ] else ...<Widget>[
                _buildAssetPhotoThumbnail(
                  context,
                  isPalletPlaceholder
                      ? _palletFallbackAsset
                      : _productFallbackAsset,
                  size: 120,
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('${strings.text('kid')}: $displayKidNumber',
                        style: const TextStyle(color: uiMuted)),
                    Text(
                        '${strings.text('section_slot')}: ${warehouseSectionLabel(item.section)} / ${item.slotNumber}',
                        style: const TextStyle(color: uiMuted)),
                    Text('${strings.text('product_key')}: $displayProductKey',
                        style: const TextStyle(color: uiMuted)),
                    Text(
                      '${strings.text('location')}: ${item.store ? strings.text('store_destination_store') : strings.text('store_destination_warehouse')}',
                      style: const TextStyle(color: uiMuted),
                    ),
                    Text('${strings.text('count')}: $count',
                        style: const TextStyle(color: uiMuted)),
                    Text('${strings.text('boxes')}: $partsCount',
                        style: const TextStyle(color: uiMuted)),
                    Text(
                      '${strings.text('b_ware')}: ${item.isBWare ? strings.text('yes') : strings.text('no')}',
                      style: const TextStyle(color: uiMuted),
                    ),
                    Text(
                      '${strings.text('in_transit')}: ${item.inTransit ? strings.text('yes') : strings.text('no')}',
                      style: const TextStyle(color: uiMuted),
                    ),
                    if ((memo ?? '').trim().isNotEmpty)
                      Text(
                        '${strings.text('memo')}: ${memo!.trim()}',
                        style: const TextStyle(color: uiMuted),
                      ),
                    if ((bWareComment ?? '').trim().isNotEmpty)
                      Text(
                        '${strings.text('b_ware_comment')}: ${bWareComment!.trim()}',
                        style: const TextStyle(color: uiMuted),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (photoUrls.length > 1) ...<Widget>[
            const SizedBox(height: 10),
            _buildPhotoStrip(startIndex: 1),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonalIcon(
              onPressed: onPrint == null ? null : () => onPrint!(),
              icon: printing
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.print_outlined),
              label: Text(strings.text('print')),
              style: FilledButton.styleFrom(
                foregroundColor: removed ? uiOrangeDeep : uiText,
                backgroundColor: removed ? removedActionBackground : uiCardSoft,
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                textStyle: const TextStyle(
                  fontWeight: FontWeight.w700,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: removed ? removedActionBorder : Colors.transparent,
                    width: removed ? 1.2 : 0,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoThumbnail(
    BuildContext context,
    String photoUrl, {
    double size = 86,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () {
        showDialog<void>(
          context: context,
          builder: (_) => _CardPhotoGalleryDialog(photoUrls: photoUrls),
        );
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: size,
          height: size,
          color: uiCardSoft,
          child: Image.network(
            photoUrl,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_outlined, color: uiMuted),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAssetPhotoThumbnail(
    BuildContext context,
    String assetPath, {
    double size = 86,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () {
        showDialog<void>(
          context: context,
          builder: (BuildContext dialogContext) {
            return Dialog(
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
              child: InteractiveViewer(
                child: AspectRatio(
                  aspectRatio: 1,
                  child: Container(
                    color: Colors.white,
                    child: Image.asset(
                      assetPath,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Center(
                        child: Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: size,
          height: size,
          color: uiCardSoft,
          child: Image.asset(
            assetPath,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_outlined, color: uiMuted),
            ),
          ),
        ),
      ),
    );
  }
}

class _CardPhotoGalleryDialog extends StatefulWidget {
  const _CardPhotoGalleryDialog({required this.photoUrls});
class InventoryCountChip extends StatelessWidget {
  const InventoryCountChip({
    super.key,
    required this.label,
    required this.count,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final String label;
  final int count;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            Icons.inventory_2_outlined,
            size: 14,
            color: foregroundColor,
          ),
          const SizedBox(width: 4),
          Text(
            '$label: $count',
            style: TextStyle(color: foregroundColor),
          ),
        ],
      ),
      backgroundColor: backgroundColor,
      visualDensity: VisualDensity.compact,
    );
  }
}

bool _isPalletPlaceholderItem(IntakeData item) {
  return _isPalletText(item.qrCode) ||
      _isPalletText(item.kidNumber) ||
      _isPalletText(item.productKey);
}

  final List<String> photoUrls;

  @override
  State<_CardPhotoGalleryDialog> createState() =>
      _CardPhotoGalleryDialogState();
}

class _CardPhotoGalleryDialogState extends State<_CardPhotoGalleryDialog> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
      ),
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          children: <Widget>[
            PageView.builder(
              itemCount: widget.photoUrls.length,
              onPageChanged: (int index) {
                setState(() => _currentIndex = index);
              },
              itemBuilder: (BuildContext context, int index) => Semantics(
                label: '${index + 1} / ${widget.photoUrls.length}',
                image: true,
                child: ColoredBox(
                  color: Colors.white,
                  child: Image.network(
                    widget.photoUrls[index],
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image_outlined),
                    ),
                  ),
                ),
              ),
            ),
            if (widget.photoUrls.length > 1)
              Positioned(
                right: 12,
                bottom: 12,
                child: Semantics(
                  liveRegion: true,
                  label: '${_currentIndex + 1} / ${widget.photoUrls.length}',
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: uiText.withValues(alpha: 0.72),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${_currentIndex + 1} / ${widget.photoUrls.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
