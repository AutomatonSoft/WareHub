import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';
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

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    final bool removed = item.isRemoved;
    final bool isPalletPlaceholder = _isPalletPlaceholderItem(item);
    final String palletLabel = strings.text('pallet_placeholder');
    final String displayKidNumber = _localizedPalletValue(
      item.kidNumber,
      palletLabel,
      emptyFallback: item.kidNumber,
    );
    final String displayPlace = warehouseLocations.isNotEmpty
        ? warehouseLocations.first
        : item.warehouseLocation.trim();
    final String displayTitle = formatInventoryProductHeading(
      place: displayPlace,
      section: item.section,
      kidNumber: displayKidNumber,
    );
    final String displayProductKey = _localizedPalletValue(
      item.productKey,
      palletLabel,
      emptyFallback: '-',
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

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: borderColor,
          width: 1.2,
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
                    child: Image.network(
                      photoUrl,
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

  Widget _buildPhotoStrip({int startIndex = 0}) {
    final List<String> urls = photoUrls.sublist(startIndex);
    if (urls.isEmpty) {
      return const SizedBox.shrink();
    }
    return SizedBox(
      height: 86,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: urls.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (BuildContext context, int index) {
          return _buildPhotoThumbnail(context, urls[index]);
        },
      ),
    );
  }
}

bool _isPalletPlaceholderItem(IntakeData item) {
  return _isPalletText(item.qrCode) ||
      _isPalletText(item.kidNumber) ||
      _isPalletText(item.productKey);
}

String _localizedPalletValue(
  String value,
  String palletLabel, {
  required String emptyFallback,
}) {
  final String trimmed = value.trim();
  if (trimmed.isEmpty) {
    return emptyFallback;
  }
  return _isPalletText(trimmed) ? palletLabel : trimmed;
}

bool _isPalletText(String value) {
  final Set<String> candidates = _normalizedPalletCandidates(value);
  return candidates.any(_palletAliases.contains);
}

Set<String> _normalizedPalletCandidates(String value) {
  final String normalized = _normalizePalletToken(value);
  final Set<String> candidates = <String>{};
  if (normalized.isNotEmpty) {
    candidates.add(normalized);
  }
  for (final RegExpMatch match
      in RegExp(r'[A-Za-zА-Яа-яЁё]+').allMatches(value)) {
    final String token = _normalizePalletToken(match.group(0) ?? '');
    if (token.isNotEmpty) {
      candidates.add(token);
    }
  }
  return candidates;
}

String _normalizePalletToken(String value) {
  return value
      .trim()
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replaceAll(RegExp(r'[^a-zа-я]'), '');
}

const Set<String> _palletAliases = <String>{
  'pallet',
  'pallets',
  'palet',
  'palets',
  'palete',
  'paletes',
  'palett',
  'paletts',
  'palette',
  'palettes',
  'pallete',
  'pallette',
  'paletten',
  'palleten',
  'палет',
  'палеты',
  'палета',
  'палетта',
  'палетты',
  'паллет',
  'паллеты',
  'паллета',
  'паллетта',
  'паллетти',
  'поддон',
  'поддоны',
};
