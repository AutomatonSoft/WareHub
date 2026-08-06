import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/qr_home_widgets.dart';

void main() {
  testWidgets('quantity chip uses an inventory icon instead of a location pin',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: InventoryCountChip(
            label: 'Count',
            count: 2,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
    expect(find.byIcon(Icons.location_on_outlined), findsNothing);
    expect(find.text('Count: 2'), findsOneWidget);
  });
}
