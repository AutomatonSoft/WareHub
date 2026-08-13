import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';
import 'auth_design_tokens.dart';
import 'inventory_item_display.dart';
import 'models.dart';
import 'warehouse_constants.dart';

class QrHomeItemDetailsPage extends StatefulWidget {
  const QrHomeItemDetailsPage({
    super.key,
    required this.item,
    required this.photoUrls,
    required this.partsCount,
    required this.count,
    required this.warehouseLocations,
    this.memo,
    this.bWareComment,
    this.onPrint,
    this.onAddPhotos,
  });

  final IntakeData item;
  final List<String> photoUrls;
  final int partsCount;
  final int count;
  final List<String> warehouseLocations;
  final String? memo;
  final String? bWareComment;
  final Future<void> Function()? onPrint;
  final Future<List<String>?> Function()? onAddPhotos;

  @override
  State<QrHomeItemDetailsPage> createState() => _QrHomeItemDetailsPageState();
}

class _QrHomeItemDetailsPageState extends State<QrHomeItemDetailsPage> {
  bool _printing = false;
  bool _addingPhotos = false;
  late List<String> _photoUrls = widget.photoUrls;

  Future<void> _print() async {
    final Future<void> Function()? onPrint = widget.onPrint;
    if (onPrint == null || _printing) {
      return;
    }
    setState(() => _printing = true);
    try {
      await onPrint();
    } finally {
      if (mounted) {
        setState(() => _printing = false);
      }
    }
  }

  Future<void> _addPhotos() async {
    final Future<List<String>?> Function()? onAddPhotos = widget.onAddPhotos;
    if (onAddPhotos == null || _addingPhotos) {
      return;
    }
    setState(() => _addingPhotos = true);
    try {
      final List<String>? updated = await onAddPhotos();
      if (updated != null && mounted) {
        setState(() => _photoUrls = updated);
      }
    } finally {
      if (mounted) {
        setState(() => _addingPhotos = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    final InventoryItemDisplayData display = InventoryItemDisplayData.fromItem(
      item: widget.item,
      warehouseLocations: widget.warehouseLocations,
      strings: strings,
    );
    final bool removed = widget.item.isRemoved;
    final Color accent = removed ? uiOrangeDeep : uiBrandGreen;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          strings.text('product_details'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      bottomNavigationBar: _PrintActionBar(
        label: strings.text('print'),
        printing: _printing,
        onPressed: widget.onPrint == null || _printing ? null : _print,
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            return Center(
              child: SizedBox(
                width: constraints.maxWidth > 760 ? 760 : constraints.maxWidth,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: <Widget>[
                    Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: accent,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      display.title,
                      style: const TextStyle(
                        color: uiText,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 14),
                    _PhotoGallery(
                      photoUrls: _photoUrls,
                      fallbackAssetPath: display.fallbackAssetPath,
                    ),
                    if (widget.onAddPhotos != null) ...<Widget>[
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _addingPhotos || _photoUrls.length >= 10
                              ? null
                              : _addPhotos,
                          icon: _addingPhotos
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.add_photo_alternate_outlined),
                          label: Text(strings.text('add_photos')),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        _StatusChip(
                          icon: Icons.inventory_2_outlined,
                          label: '${strings.text('count')}: ${widget.count}',
                        ),
                        _StatusChip(
                          icon: Icons.all_inbox_outlined,
                          label:
                              '${strings.text('boxes')}: ${widget.partsCount}',
                        ),
                        if (widget.item.isBWare)
                          _StatusChip(
                            icon: Icons.build_circle_outlined,
                            label: strings.text('b_ware'),
                            emphasized: true,
                          ),
                        if (widget.item.inTransit)
                          _StatusChip(
                            icon: Icons.local_shipping_outlined,
                            label: strings.text('in_transit'),
                            emphasized: true,
                          ),
                        if (removed)
                          _StatusChip(
                            icon: Icons.remove_circle_outline,
                            label: strings.text('removed'),
                            destructive: true,
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _DetailsSection(
                      title: strings.text('product_information'),
                      children: <Widget>[
                        _DetailRow(
                          label: strings.text('kid'),
                          value: display.kidNumber,
                        ),
                        _DetailRow(
                          label: strings.text('section_slot'),
                          value:
                              '${warehouseSectionLabel(widget.item.section)} / ${widget.item.slotNumber}',
                        ),
                        _DetailRow(
                          label: strings.text('product_key'),
                          value: display.productKey,
                        ),
                        _DetailRow(
                          label: strings.text('location'),
                          value: widget.item.store
                              ? strings.text('store_destination_store')
                              : strings.text('store_destination_warehouse'),
                        ),
                        if (widget.warehouseLocations.length > 1)
                          _DetailRow(
                            label: strings.text('warehouse_locations'),
                            value: widget.warehouseLocations.join(', '),
                          ),
                        _DetailRow(
                          label: strings.text('b_ware'),
                          value: widget.item.isBWare
                              ? strings.text('yes')
                              : strings.text('no'),
                        ),
                        _DetailRow(
                          label: strings.text('in_transit'),
                          value: widget.item.inTransit
                              ? strings.text('yes')
                              : strings.text('no'),
                          isLast: true,
                        ),
                      ],
                    ),
                    if ((widget.memo ?? '').trim().isNotEmpty) ...<Widget>[
                      const SizedBox(height: 16),
                      _TextSection(
                        title: strings.text('memo'),
                        value: widget.memo!.trim(),
                      ),
                    ],
                    if ((widget.bWareComment ?? '')
                        .trim()
                        .isNotEmpty) ...<Widget>[
                      const SizedBox(height: 16),
                      _TextSection(
                        title: strings.text('b_ware_comment'),
                        value: widget.bWareComment!.trim(),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _PrintActionBar extends StatelessWidget {
  const _PrintActionBar({
    required this.label,
    required this.printing,
    required this.onPressed,
  });

  final String label;
  final bool printing;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: uiBg,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AuthColors.border)),
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Center(
            heightFactor: 1,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 728),
              child: FilledButton.icon(
                onPressed: onPressed,
                icon: printing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.print_outlined),
                label: Text(label),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PhotoGallery extends StatefulWidget {
  const _PhotoGallery({
    required this.photoUrls,
    required this.fallbackAssetPath,
  });

  final List<String> photoUrls;
  final String fallbackAssetPath;

  @override
  State<_PhotoGallery> createState() => _PhotoGalleryState();
}

class _PhotoGalleryState extends State<_PhotoGallery> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.photoUrls.isEmpty) {
      return _PhotoTile(
        assetPath: widget.fallbackAssetPath,
        height: 280,
      );
    }

    return SizedBox(
      height: 280,
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
              child: _PhotoTile(
                photoUrl: widget.photoUrls[index],
                height: 280,
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
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    this.photoUrl,
    this.assetPath,
    required this.height,
  }) : assert(photoUrl != null || assetPath != null);

  final String? photoUrl;
  final String? assetPath;
  final double height;

  @override
  Widget build(BuildContext context) {
    final Widget image = photoUrl == null
        ? Image.asset(
            assetPath!,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_outlined, color: uiMuted),
            ),
          )
        : Image.network(
            photoUrl!,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_outlined, color: uiMuted),
            ),
          );

    return Material(
      color: uiCardSoft,
      borderRadius: BorderRadius.circular(AuthRadii.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _showPhoto(context, image),
        child: SizedBox(width: double.infinity, height: height, child: image),
      ),
    );
  }

  void _showPhoto(BuildContext context, Widget image) {
    showDialog<void>(
      context: context,
      builder: (BuildContext context) => Dialog(
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AuthRadii.xl),
        ),
        child: InteractiveViewer(
          child: AspectRatio(
            aspectRatio: 1,
            child: ColoredBox(color: Colors.white, child: image),
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.icon,
    required this.label,
    this.emphasized = false,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final bool emphasized;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final Color foreground = destructive
        ? uiOrangeDeep
        : emphasized
            ? uiBrandGreen
            : uiText;
    final Color background = destructive
        ? uiOrangeDeep.withValues(alpha: 0.10)
        : emphasized
            ? uiBrandGreenSoft
            : uiCardSoft;

    return Container(
      constraints: const BoxConstraints(minHeight: 36),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 17, color: foreground),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: foreground,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailsSection extends StatelessWidget {
  const _DetailsSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: uiCard,
        borderRadius: BorderRadius.circular(AuthRadii.xl),
        border: Border.all(color: AuthColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            title,
            style: const TextStyle(
              color: uiText,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.isLast = false,
  });

  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: AuthColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 124,
            child: Text(
              label,
              style: const TextStyle(
                color: uiMuted,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: SelectableText(
              value,
              style: const TextStyle(
                color: uiText,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TextSection extends StatelessWidget {
  const _TextSection({required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return _DetailsSection(
      title: title,
      children: <Widget>[
        SelectableText(
          value,
          style: const TextStyle(
            color: uiText,
            fontSize: 15,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}
