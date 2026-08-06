import 'package:flutter/material.dart';

const double _warehousePlanWidth = 440;
const double _warehousePlanHeight = 1000;
const double _mapSurfaceRadius = 16;
const Color _mapSurfaceBackground = Colors.white;
const Color _mapSurfaceBorder = Color(0xFFDCE4EC);

class WarehouseMapCanvas extends StatefulWidget {
  const WarehouseMapCanvas({
    super.key,
    required this.semanticsLabel,
    required this.showroomLabel,
    required this.zoomInLabel,
    required this.zoomOutLabel,
  });

  final String semanticsLabel;
  final String showroomLabel;
  final String zoomInLabel;
  final String zoomOutLabel;

  @override
  State<WarehouseMapCanvas> createState() => _WarehouseMapCanvasState();
}

class _WarehouseMapCanvasState extends State<WarehouseMapCanvas> {
  static const double _minScale = 1;
  static const double _maxScale = 4;
  static const double _scaleStep = 0.5;
  static const double _minimumScaleTolerance = 0.01;

  final TransformationController _transformationController =
      TransformationController();

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  void _changeScale(double delta, Size viewportSize) {
    final Matrix4 currentMatrix = _transformationController.value;
    final double currentScale = currentMatrix.getMaxScaleOnAxis();
    final double newScale =
        (currentScale + delta).clamp(_minScale, _maxScale).toDouble();
    if (newScale == currentScale) {
      return;
    }
    if (newScale <= _minScale + _minimumScaleTolerance) {
      _resetPosition();
      return;
    }

    final double scaleFactor = newScale / currentScale;
    final Offset viewportCenter = viewportSize.center(Offset.zero);
    final double currentX = currentMatrix.storage[12];
    final double currentY = currentMatrix.storage[13];
    final double newX =
        viewportCenter.dx - scaleFactor * (viewportCenter.dx - currentX);
    final double newY =
        viewportCenter.dy - scaleFactor * (viewportCenter.dy - currentY);

    _transformationController.value = Matrix4.identity()
      ..setEntry(0, 0, newScale)
      ..setEntry(1, 1, newScale)
      ..setTranslationRaw(newX, newY, 0);
  }

  void _resetPositionAtMinimumScale() {
    final double scale = _transformationController.value.getMaxScaleOnAxis();
    if (scale <= _minScale + _minimumScaleTolerance) {
      _resetPosition();
    }
  }

  void _resetPosition() {
    _transformationController.value = Matrix4.identity();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      image: true,
      label: widget.semanticsLabel,
      child: Container(
        key: const Key('warehouse-map-surface'),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: _mapSurfaceBackground,
          borderRadius: BorderRadius.circular(_mapSurfaceRadius),
        ),
        foregroundDecoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_mapSurfaceRadius),
          border: Border.all(color: _mapSurfaceBorder),
        ),
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) {
            const double planAspectRatio =
                _warehousePlanWidth / _warehousePlanHeight;
            double planWidth = constraints.maxWidth;
            double planHeight = planWidth / planAspectRatio;
            if (planHeight > constraints.maxHeight) {
              planHeight = constraints.maxHeight;
              planWidth = planHeight * planAspectRatio;
            }

            return Stack(
              children: <Widget>[
                InteractiveViewer(
                  transformationController: _transformationController,
                  minScale: _minScale,
                  maxScale: _maxScale,
                  boundaryMargin: EdgeInsets.zero,
                  onInteractionEnd: (_) => _resetPositionAtMinimumScale(),
                  child: Center(
                    child: SizedBox(
                      width: planWidth,
                      height: planHeight,
                      child: CustomPaint(
                        painter: WarehouseMapPainter(
                          showroomLabel: widget.showroomLabel,
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: 12,
                  bottom: 12,
                  child: ValueListenableBuilder<Matrix4>(
                    valueListenable: _transformationController,
                    builder: (
                      BuildContext context,
                      Matrix4 transformation,
                      Widget? child,
                    ) {
                      final double scale = transformation.getMaxScaleOnAxis();
                      return _MapZoomControls(
                        canZoomIn: scale < _maxScale,
                        canZoomOut: scale > _minScale,
                        zoomInLabel: widget.zoomInLabel,
                        zoomOutLabel: widget.zoomOutLabel,
                        onZoomIn: () => _changeScale(
                          _scaleStep,
                          constraints.biggest,
                        ),
                        onZoomOut: () => _changeScale(
                          -_scaleStep,
                          constraints.biggest,
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MapZoomControls extends StatelessWidget {
  const _MapZoomControls({
    required this.canZoomIn,
    required this.canZoomOut,
    required this.zoomInLabel,
    required this.zoomOutLabel,
    required this.onZoomIn,
    required this.onZoomOut,
  });

  final bool canZoomIn;
  final bool canZoomOut;
  final String zoomInLabel;
  final String zoomOutLabel;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 3,
      shadowColor: const Color(0x300F172A),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFD8E0E8)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          _MapZoomButton(
            icon: Icons.add_rounded,
            tooltip: zoomInLabel,
            onPressed: canZoomIn ? onZoomIn : null,
          ),
          const SizedBox(
            width: 44,
            child: Divider(height: 1, color: Color(0xFFD8E0E8)),
          ),
          _MapZoomButton(
            icon: Icons.remove_rounded,
            tooltip: zoomOutLabel,
            onPressed: canZoomOut ? onZoomOut : null,
          ),
        ],
      ),
    );
  }
}

class _MapZoomButton extends StatelessWidget {
  const _MapZoomButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      constraints: const BoxConstraints.tightFor(width: 48, height: 48),
      padding: EdgeInsets.zero,
      tooltip: tooltip,
      onPressed: onPressed,
      color: const Color(0xFF24323D),
      disabledColor: const Color(0xFFADB7C2),
      icon: Icon(icon, size: 26),
    );
  }
}

class WarehouseMapPainter extends CustomPainter {
  const WarehouseMapPainter({required this.showroomLabel});

  final String showroomLabel;

  static const Color _coral = Color(0xFFF08A94);
  static const Color _indigo = Color(0xFFA7B0E0);
  static const Color _teal = Color(0xFF73C5D2);
  static const Color _amber = Color(0xFFF4C66A);
  static const Color _emerald = Color(0xFF78C9A0);
  static const Color _lime = Color(0xFFCDE58A);
  static const Color _rose = Color(0xFFF2B5CB);
  static const Color _violet = Color(0xFFBFA1D5);
  static const Color _darkLabel = Color(0xFF24323D);
  static const Color _outline = Color(0xFF64748B);
  static const Color _office = Color(0xFFF8FAFC);
  static const double _zoneRadius = 10;
  static const double _buildingRadius = 14;
  static const double _officeRadius = 9;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(
      size.width / _warehousePlanWidth,
      size.height / _warehousePlanHeight,
    );

    _drawSite(canvas);
    _drawUpperWarehouse(canvas);
    _drawConnectionRoad(canvas);
    _drawLowerWarehouse(canvas);

    canvas.restore();
  }

  void _drawSite(Canvas canvas) {
    final Paint sitePaint = Paint()..color = const Color(0xFFE4EAF0);
    final Paint roadPaint = Paint()
      ..color = const Color(0xFFCBD5E1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    canvas.drawRect(
      const Rect.fromLTWH(0, 0, _warehousePlanWidth, _warehousePlanHeight),
      Paint()..color = const Color(0xFFFBFCFD),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(12, 530, 402, 54),
        const Radius.circular(16),
      ),
      sitePaint,
    );
    canvas.drawLine(const Offset(20, 557), const Offset(310, 557), roadPaint);
  }

  void _drawUpperWarehouse(Canvas canvas) {
    const Rect building = Rect.fromLTWH(88, 18, 326, 492);
    _drawBuildingShell(canvas, building);

    final Path zoneA = Path()
      ..moveTo(104, 26)
      ..lineTo(304, 26)
      ..quadraticBezierTo(314, 26, 314, 36)
      ..lineTo(314, 180)
      ..quadraticBezierTo(314, 192, 326, 192)
      ..lineTo(396, 192)
      ..quadraticBezierTo(406, 192, 406, 202)
      ..lineTo(406, 290)
      ..quadraticBezierTo(406, 300, 396, 300)
      ..lineTo(104, 300)
      ..quadraticBezierTo(96, 300, 96, 290)
      ..lineTo(96, 36)
      ..quadraticBezierTo(96, 26, 104, 26)
      ..close();
    _drawZonePath(canvas, zoneA, _coral);

    _drawZone(
      canvas,
      const Rect.fromLTWH(94, 302, 246, 70),
      _indigo,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(94, 372, 246, 36),
      _teal,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(94, 408, 246, 96),
      _amber,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(340, 302, 68, 202),
      _emerald,
    );

    _drawOfficeBlock(
      canvas,
      const Rect.fromLTWH(316, 24, 92, 166),
      columns: 2,
      rows: 4,
    );

    _drawZoneTitle(
      canvas,
      label: 'A',
      subtitle: showroomLabel,
      center: const Offset(205, 164),
    );
    _drawLabel(canvas, 'B', const Offset(217, 337), fontSize: 42);
    _drawLabel(canvas, 'C', const Offset(217, 390), fontSize: 28);
    _drawLabel(canvas, 'D', const Offset(217, 456), fontSize: 42);
    _drawLabel(canvas, 'E', const Offset(374, 403), fontSize: 40);
  }

  void _drawConnectionRoad(Canvas canvas) {
    final Paint arrowPaint = Paint()
      ..color = const Color(0xFF287D72)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    final RRect loadingArea = RRect.fromRectAndRadius(
      const Rect.fromLTWH(318, 520, 96, 72),
      const Radius.circular(12),
    );
    final Path loadingAreaPath = Path()..addRRect(loadingArea);
    canvas.drawShadow(loadingAreaPath, const Color(0x300F172A), 3, false);
    canvas.drawRRect(
      loadingArea,
      Paint()..color = const Color(0xFFFFF2CF),
    );
    canvas.drawRRect(
      loadingArea,
      Paint()
        ..color = const Color(0xFFB7791F)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    final Path arrow = Path()
      ..moveTo(238, 557)
      ..lineTo(307, 557)
      ..moveTo(294, 545)
      ..lineTo(307, 557)
      ..lineTo(294, 569);
    canvas.drawPath(arrow, arrowPaint);
  }

  void _drawLowerWarehouse(Canvas canvas) {
    const Rect building = Rect.fromLTWH(28, 600, 386, 376);
    _drawBuildingShell(canvas, building);

    _drawZone(
      canvas,
      const Rect.fromLTWH(34, 606, 374, 72),
      _lime,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(34, 678, 75, 292),
      _rose,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(109, 678, 65, 292),
      _teal,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(174, 678, 61, 188),
      _amber,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(235, 678, 58, 188),
      _violet,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(293, 678, 63, 188),
      _coral,
    );
    _drawZone(
      canvas,
      const Rect.fromLTWH(356, 678, 52, 188),
      _teal,
    );

    _drawOfficeBlock(
      canvas,
      const Rect.fromLTWH(174, 866, 234, 104),
      columns: 5,
      rows: 2,
    );

    _drawLabel(canvas, 'F', const Offset(221, 642), fontSize: 42);
    _drawLabel(canvas, 'M', const Offset(71, 824), fontSize: 40);
    _drawLabel(canvas, 'K', const Offset(141, 824), fontSize: 40);
    _drawLabel(canvas, 'J', const Offset(204, 772), fontSize: 40);
    _drawLabel(canvas, 'I', const Offset(264, 772), fontSize: 40);
    _drawLabel(canvas, 'H', const Offset(325, 772), fontSize: 40);
    _drawLabel(canvas, 'G', const Offset(382, 772), fontSize: 38);
  }

  void _drawBuildingShell(Canvas canvas, Rect rect) {
    final RRect building = RRect.fromRectAndRadius(
      rect,
      const Radius.circular(_buildingRadius),
    );
    canvas.drawRRect(building, Paint()..color = _office);
    canvas.drawRRect(
      building,
      Paint()
        ..color = _outline
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4,
    );
  }

  void _drawZone(Canvas canvas, Rect rect, Color color) {
    final RRect zone = RRect.fromRectAndRadius(
      rect.deflate(1.5),
      const Radius.circular(_zoneRadius),
    );
    final Path zonePath = Path()..addRRect(zone);
    canvas.drawShadow(zonePath, const Color(0x260F172A), 2.5, false);
    canvas.drawRRect(zone, Paint()..color = color);
    canvas.drawRRect(
      zone,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
  }

  void _drawZonePath(Canvas canvas, Path path, Color color) {
    canvas.drawShadow(path, const Color(0x260F172A), 2.5, false);
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
  }

  void _drawOfficeBlock(
    Canvas canvas,
    Rect rect, {
    required int columns,
    required int rows,
  }) {
    final RRect office = RRect.fromRectAndRadius(
      rect.deflate(1.5),
      const Radius.circular(_officeRadius),
    );
    canvas.save();
    canvas.clipRRect(office);
    canvas.drawRRect(office, Paint()..color = _office);
    final Paint gridPaint = Paint()
      ..color = const Color(0xFFA8B4C2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;

    for (int column = 1; column < columns; column += 1) {
      final double x = rect.left + (rect.width * column / columns);
      canvas.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), gridPaint);
    }
    for (int row = 1; row < rows; row += 1) {
      final double y = rect.top + (rect.height * row / rows);
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), gridPaint);
    }
    canvas.restore();
    canvas.drawRRect(office, gridPaint);
  }

  void _drawLabel(
    Canvas canvas,
    String label,
    Offset center, {
    double fontSize = 42,
  }) {
    final TextPainter painter = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: _darkLabel,
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          height: 1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    canvas.save();
    canvas.translate(center.dx, center.dy);
    painter.paint(canvas, Offset(-painter.width / 2, -painter.height / 2));
    canvas.restore();
  }

  void _drawZoneTitle(
    Canvas canvas, {
    required String label,
    required String subtitle,
    required Offset center,
  }) {
    final TextPainter painter = TextPainter(
      text: TextSpan(
        children: <InlineSpan>[
          TextSpan(
            text: '$label\n',
            style: const TextStyle(
              color: _darkLabel,
              fontSize: 47,
              fontWeight: FontWeight.w700,
              height: 1,
            ),
          ),
          TextSpan(
            text: subtitle,
            style: const TextStyle(
              color: _darkLabel,
              fontSize: 19,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.5,
              height: 1.25,
            ),
          ),
        ],
      ),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 128);

    painter.paint(
      canvas,
      Offset(
        center.dx - painter.width / 2,
        center.dy - painter.height / 2,
      ),
    );
  }

  @override
  bool shouldRepaint(covariant WarehouseMapPainter oldDelegate) {
    return showroomLabel != oldDelegate.showroomLabel;
  }
}
