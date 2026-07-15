import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/qr_home_page.dart';

void main() {
  testWidgets('opens a height-limited picker and returns selected value',
      (WidgetTester tester) async {
    String selected = 'Option 1';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (BuildContext context, StateSetter setState) {
              return Center(
                child: AppSelectField<String>(
                  label: 'Quantity',
                  value: selected,
                  options: List<AppSelectOption<String>>.generate(
                    30,
                    (int index) => AppSelectOption<String>(
                      value: 'Option ${index + 1}',
                      label: 'Option ${index + 1}',
                    ),
                  ),
                  onChanged: (String value) {
                    setState(() => selected = value);
                  },
                ),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.byType(AppSelectField<String>));
    await tester.pumpAndSettle();

    final Finder picker = find.byKey(const Key('app-select-picker'));
    expect(picker, findsOneWidget);
    expect(tester.getSize(picker).height, lessThanOrEqualTo(800 * 0.62));
    final SafeArea safeArea = tester.widget<SafeArea>(
      find.byKey(const Key('app-select-safe-area')),
    );
    expect(safeArea.maintainBottomViewPadding, isTrue);
    expect(safeArea.minimum.bottom, 12);

    await tester.tap(find.text('Option 2').last);
    await tester.pumpAndSettle();

    expect(selected, 'Option 2');
    expect(picker, findsNothing);
  });
}
