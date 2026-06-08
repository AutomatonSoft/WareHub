import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('widget smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: Text('ok')));
    expect(find.text('ok'), findsOneWidget);
  });
}
