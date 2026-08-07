import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_language.dart';
import 'package:sofortbot_mobile/app_strings.dart';
import 'package:sofortbot_mobile/warehouse_map_sheet.dart';

void main() {
  testWidgets('warehouse map button opens the interactive map sheet',
      (WidgetTester tester) async {
    const AppStrings strings = AppStrings(AppLang.en);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (BuildContext context) {
            return Scaffold(
              body: IconButton(
                tooltip: strings.text('warehouse_map'),
                onPressed: () => showWarehouseMapSheet(
                  context,
                  strings: strings,
                ),
                icon: const Icon(Icons.map_outlined),
              ),
            );
          },
        ),
      ),
    );

    await tester.tap(find.byTooltip('Warehouse map'));
    await tester.pumpAndSettle();

    expect(find.text('Warehouse map'), findsOneWidget);
    expect(
      find.text('Pinch to zoom and drag to move the map.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(
        'Warehouse map with showroom zone A through zone M and a goods receiving area.',
      ),
      findsOneWidget,
    );
    expect(find.byTooltip('Zoom in'), findsOneWidget);
    expect(find.byTooltip('Zoom out'), findsOneWidget);
    final Container mapSurface = tester.widget<Container>(
      find.byKey(const Key('warehouse-map-surface')),
    );
    final BoxDecoration mapBackground = mapSurface.decoration! as BoxDecoration;
    final BoxDecoration mapBorder =
        mapSurface.foregroundDecoration! as BoxDecoration;
    expect(mapBackground.color, Colors.white);
    expect(mapBorder.border, isNotNull);
    expect(
      tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .boundaryMargin,
      EdgeInsets.zero,
    );

    await tester.tap(find.byTooltip('Zoom in'));
    await tester.pump();

    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.remove_rounded),
          )
          .onPressed,
      isNotNull,
    );

    final InteractiveViewer viewer =
        tester.widget<InteractiveViewer>(find.byType(InteractiveViewer));
    final TransformationController controller =
        viewer.transformationController!;
    controller.value = Matrix4.identity()
      ..setEntry(0, 0, 1.5)
      ..setEntry(1, 1, 1.5)
      ..setTranslationRaw(-60, -90, 0);
    await tester.pump();

    await tester.tap(find.byTooltip('Zoom out'));
    await tester.pump();

    expect(controller.value.storage, orderedEquals(Matrix4.identity().storage));

    controller.value = Matrix4.identity()..setTranslationRaw(-30, -45, 0);
    final InteractiveViewer resettableViewer =
        tester.widget<InteractiveViewer>(find.byType(InteractiveViewer));
    resettableViewer.onInteractionEnd!(ScaleEndDetails());

    expect(controller.value.storage, orderedEquals(Matrix4.identity().storage));
  });
}
