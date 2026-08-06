import 'package:flutter/material.dart';

import 'app_strings.dart';
import 'app_theme.dart';
import 'auth_design_tokens.dart';
import 'warehouse_map_canvas.dart';

Future<void> showWarehouseMapSheet(
  BuildContext context, {
  required AppStrings strings,
}) {
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (BuildContext sheetContext) {
      return FractionallySizedBox(
        heightFactor: 0.82,
        child: Material(
          color: uiCard,
          clipBehavior: Clip.antiAlias,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AuthRadii.xl),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AuthColors.border,
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: <Widget>[
                      const Icon(
                        Icons.map_outlined,
                        color: uiBrandGreen,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              strings.text('warehouse_map'),
                              style:
                                  AuthTextStyles.title.copyWith(fontSize: 22),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              strings.text('warehouse_map_subtitle'),
                              style: AuthTextStyles.helper,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: MaterialLocalizations.of(sheetContext)
                            .closeButtonTooltip,
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: WarehouseMapCanvas(
                      semanticsLabel: strings.text('warehouse_map_semantics'),
                      showroomLabel: strings.text('warehouse_showroom'),
                      zoomInLabel: strings.text('warehouse_map_zoom_in'),
                      zoomOutLabel: strings.text('warehouse_map_zoom_out'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    strings.text('warehouse_map_hint'),
                    textAlign: TextAlign.center,
                    style: AuthTextStyles.helper,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
