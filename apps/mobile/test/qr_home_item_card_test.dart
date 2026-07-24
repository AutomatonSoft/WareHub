import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sofortbot_mobile/app_settings.dart';
import 'package:sofortbot_mobile/app_theme.dart';
import 'package:sofortbot_mobile/models.dart';
import 'package:sofortbot_mobile/qr_home_item_details_page.dart';
import 'package:sofortbot_mobile/qr_home_widgets.dart';

void main() {
  late AppSettings settings;

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    settings = await AppSettings.load();
  });

  testWidgets('compact card truncates long memo and opens details',
      (WidgetTester tester) async {
    _usePhoneViewport(tester);
    bool opened = false;
    const String longMemo =
        'This is a deliberately long warehouse note that must remain compact '
        'inside the inventory list while the complete value stays available '
        'on the product details screen.';

    await tester.pumpWidget(
      _testApp(
        settings,
        QrHomeItemCard(
          item: _item,
          photoUrls: const <String>[],
          partsCount: 3,
          count: 1,
          warehouseLocations: const <String>['371'],
          memo: longMemo,
          printing: false,
          onPrint: null,
          onOpenDetails: () => opened = true,
        ),
      ),
    );

    final Text memo = tester.widget<Text>(find.textContaining(longMemo));
    expect(memo.maxLines, 2);
    expect(memo.overflow, TextOverflow.ellipsis);
    expect(find.text('KID: 566724279'), findsOneWidget);
    expect(find.text('Section/Slot: 371 / 1'), findsOneWidget);
    expect(find.text('Company: Example company'), findsOneWidget);
    expect(find.text('Location: Warehouse'), findsOneWidget);
    expect(find.text('Count: 1'), findsOneWidget);
    expect(find.text('Boxes: 3'), findsOneWidget);
    expect(find.text('B-Ware: No'), findsOneWidget);
    expect(find.text('In Transit: No'), findsOneWidget);
    expect(find.text('Print'), findsOneWidget);

    await tester.tap(find.text('371 / 371 - 566724279'));
    await tester.pump();
    expect(opened, isTrue);
  });

  testWidgets('details screen exposes the complete memo',
      (WidgetTester tester) async {
    _usePhoneViewport(tester);
    const String longMemo =
        'Complete notes stay readable here without truncation, including all '
        'handling instructions for the warehouse employee.';

    await tester.pumpWidget(
      _testApp(
        settings,
        const QrHomeItemDetailsPage(
          item: _item,
          photoUrls: <String>[],
          partsCount: 3,
          count: 1,
          warehouseLocations: <String>['371'],
          memo: longMemo,
          onPrint: _noopPrint,
        ),
      ),
    );

    expect(find.text('Product details'), findsOneWidget);
    final Finder printButton = find.widgetWithText(FilledButton, 'Print');
    expect(printButton, findsOneWidget);
    final double printButtonYBeforeScroll = tester.getCenter(printButton).dy;
    await tester.drag(find.byType(ListView).first, const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text(longMemo), findsOneWidget);
    expect(tester.getCenter(printButton).dy, printButtonYBeforeScroll);
    expect(tester.takeException(), isNull);
  });

  testWidgets('compact card renders only the first product photo',
      (WidgetTester tester) async {
    _usePhoneViewport(tester);
    const List<String> photoUrls = <String>[
      'https://example.com/photo-1.jpg',
      'https://example.com/photo-2.jpg',
      'https://example.com/photo-3.jpg',
    ];

    await tester.pumpWidget(
      _testApp(
        settings,
        QrHomeItemCard(
          item: _item,
          photoUrls: photoUrls,
          partsCount: 3,
          count: 1,
          warehouseLocations: const <String>['371'],
          printing: false,
          onPrint: null,
          onOpenDetails: () {},
        ),
      ),
    );

    expect(_networkImageFinder(photoUrls.first), findsOneWidget);
    expect(_networkImageFinder(photoUrls[1]), findsNothing);
    expect(_networkImageFinder(photoUrls[2]), findsNothing);
  });

  testWidgets('compact card photo dialog swipes through every product photo',
      (WidgetTester tester) async {
    _usePhoneViewport(tester);
    const List<String> photoUrls = <String>[
      'https://example.com/photo-1.jpg',
      'https://example.com/photo-2.jpg',
      'https://example.com/photo-3.jpg',
    ];

    await tester.pumpWidget(
      _testApp(
        settings,
        QrHomeItemCard(
          item: _item,
          photoUrls: photoUrls,
          partsCount: 3,
          count: 1,
          warehouseLocations: const <String>['371'],
          printing: false,
          onPrint: null,
          onOpenDetails: () {},
        ),
      ),
    );

    await tester.tap(_networkImageFinder(photoUrls.first));
    await tester.pump();

    expect(find.byType(Dialog), findsOneWidget);
    expect(find.byType(PageView), findsOneWidget);
    expect(find.text('1 / 3'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();

    expect(find.text('2 / 3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('details gallery swipes through every product photo',
      (WidgetTester tester) async {
    _usePhoneViewport(tester);
    const List<String> photoUrls = <String>[
      'https://example.com/photo-1.jpg',
      'https://example.com/photo-2.jpg',
      'https://example.com/photo-3.jpg',
    ];

    await tester.pumpWidget(
      _testApp(
        settings,
        const QrHomeItemDetailsPage(
          item: _item,
          photoUrls: photoUrls,
          partsCount: 3,
          count: 1,
          warehouseLocations: <String>['371'],
        ),
      ),
    );

    expect(find.byType(PageView), findsOneWidget);
    expect(find.text('1 / 3'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();

    expect(find.text('2 / 3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Finder _networkImageFinder(String url) {
  return find.byWidgetPredicate(
    (Widget widget) =>
        widget is Image &&
        widget.image is NetworkImage &&
        (widget.image as NetworkImage).url == url,
  );
}

Future<void> _noopPrint() async {}

void _usePhoneViewport(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(375, 812);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

Widget _testApp(AppSettings settings, Widget child) {
  return AppSettingsScope(
    settings: settings,
    child: MaterialApp(
      theme: buildAppTheme(),
      home: Scaffold(body: child),
    ),
  );
}

const IntakeData _item = IntakeData(
  id: 'item-1',
  databaseKidId: 1,
  qrCode: 'qr-1',
  warehouseLocation: '371',
  kidNumber: '566724279',
  photoUrl: '',
  productKey: 'Example company',
  section: '371',
  slotNumber: 1,
  boxIndex: 1,
  boxTotal: 3,
  unitIndex: 1,
  isBWare: false,
  store: false,
  inTransit: false,
  createdAt: '2026-07-24T00:00:00Z',
  isRemoved: false,
  isActive: true,
);
