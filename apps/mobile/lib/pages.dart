import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'app_settings.dart';
import 'app_theme.dart';

class PartsQuantityPage extends StatefulWidget {
  const PartsQuantityPage({super.key});

  @override
  State<PartsQuantityPage> createState() => _PartsQuantityPageState();
}

class _PartsQuantityPageState extends State<PartsQuantityPage> {
  final TextEditingController _quantityController =
      TextEditingController(text: '1');
  String? _error;

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  void _submit() {
    final int? quantity = int.tryParse(_quantityController.text.trim());
    if (quantity == null || quantity <= 0) {
      setState(() {
        _error = AppStrings.of(context).text('quantity_min_error');
      });
      return;
    }
    Navigator.of(context).pop(quantity);
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(strings.text('parts_quantity_title'))),
      body: SafeArea(
        child: Container(
          decoration: const BoxDecoration(gradient: appBackgroundGradient),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: uiCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: uiBorder),
                boxShadow: const <BoxShadow>[
                  BoxShadow(
                    color: Color(0x55000000),
                    blurRadius: 22,
                    offset: Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(
                    strings.text('parts_quantity_help'),
                    style: const TextStyle(fontSize: 14, color: uiMuted),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _quantityController,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: strings.text('parts_label'),
                      border: const OutlineInputBorder(),
                      errorText: _error,
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                  const Spacer(),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(context).pop(null),
                          child: Text(strings.text('cancel')),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: _submit,
                          child: Text(strings.text('continue')),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class QrScannerPage extends StatefulWidget {
  const QrScannerPage({super.key});

  @override
  State<QrScannerPage> createState() => _QrScannerPageState();
}

class _QrScannerPageState extends State<QrScannerPage> {
  bool _handled = false;
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.unrestricted,
    formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
  );

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return Scaffold(
      backgroundColor: uiBg,
      appBar: AppBar(title: Text(strings.text('scan_qr'))),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: uiBorder),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x55000000),
                blurRadius: 26,
                offset: Offset(0, 14),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: <Widget>[
              Positioned.fill(
                child: MobileScanner(
                  controller: _scannerController,
                  onDetect: (BarcodeCapture capture) {
                    if (_handled) {
                      return;
                    }
                    for (final Barcode barcode in capture.barcodes) {
                      if (barcode.format != BarcodeFormat.qrCode &&
                          barcode.format != BarcodeFormat.unknown) {
                        continue;
                      }
                      final String? rawCode = barcode.rawValue;
                      if (rawCode == null || rawCode.trim().isEmpty) {
                        continue;
                      }
                      _handled = true;
                      Navigator.of(context).pop(rawCode.trim());
                      return;
                    }
                  },
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: uiBorder),
                  ),
                  child: Text(
                    strings.text('align_qr'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
