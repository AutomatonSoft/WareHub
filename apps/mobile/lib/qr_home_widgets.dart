import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';
import 'models.dart';

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
    final bool hasMultipleLocations = warehouseLocations.length > 1;
    final Color background = removed ? uiCardSoft : uiCard;
    const Color border = uiBorder;
    final Color countChipBackground = removed
        ? uiOrangeDeep.withValues(alpha: 0.20)
        : hasMultipleLocations
            ? uiGreen.withValues(alpha: 0.24)
            : uiCyan.withValues(alpha: 0.18);
    final Color countChipForeground = removed ? uiOrangeDeep : uiNavy;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x1A0F172A),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            height: 4,
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              gradient: appCtaGradient,
            ),
          ),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  item.qrCode,
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
              if (removed)
                Chip(
                  label: Text(
                    strings.text('removed'),
                    style: const TextStyle(color: uiOrangeDeep),
                  ),
                  backgroundColor: uiOrangeDeep.withValues(alpha: 0.18),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text('${strings.text('kid')}: ${item.kidNumber}',
              style: const TextStyle(color: uiMuted)),
          Text(
              '${strings.text('section_slot')}: ${item.section} / ${item.slotNumber}',
              style: const TextStyle(color: uiMuted)),
          Text(
              '${strings.text('product_key')}: ${item.productKey.isEmpty ? "-" : item.productKey}',
              style: const TextStyle(color: uiMuted)),
          if (warehouseLocations.isNotEmpty)
            Text(
              '${strings.text('warehouse_place')}: ${warehouseLocations.join(', ')}',
              style: const TextStyle(color: uiMuted),
            ),
          Text('${strings.text('count')}: $count',
              style: const TextStyle(color: uiMuted)),
          Text('${strings.text('boxes')}: $partsCount',
              style: const TextStyle(color: uiMuted)),
          Text('${strings.text('unit')}: ${item.unitIndex}',
              style: const TextStyle(color: uiMuted)),
          Text(
            '${strings.text('b_ware')}: ${item.isBWare ? strings.text('yes') : strings.text('no')}',
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
          if (photoUrls.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            _buildPhotoStrip(),
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
                foregroundColor: uiText,
                backgroundColor: uiCardSoft,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoStrip() {
    return SizedBox(
      height: 86,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: photoUrls.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (BuildContext context, int index) {
          final String photoUrl = photoUrls[index];
          return InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              showDialog<void>(
                context: context,
                builder: (BuildContext dialogContext) {
                  return Dialog(
                    child: InteractiveViewer(
                      child: AspectRatio(
                        aspectRatio: 1,
                        child: Image.network(
                          photoUrl,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const Center(
                            child: Icon(Icons.broken_image_outlined),
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
              child: SizedBox(
                width: 86,
                child: Image.network(
                  photoUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: uiCardSoft,
                    alignment: Alignment.center,
                    child:
                        const Icon(Icons.broken_image_outlined, color: uiMuted),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
