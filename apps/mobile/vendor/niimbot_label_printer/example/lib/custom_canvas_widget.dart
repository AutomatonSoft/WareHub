import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'dart:ui' as ui;

enum TextPosition { left, center, right }

class TextInfo {
  final String text;
  final TextPosition position;
  final double fontSize;
  final bool isBold;

  TextInfo({required this.text, required this.position, required this.fontSize, this.isBold = false});
}

class CustomQRWidget extends StatelessWidget {
  final List<TextInfo> textList;
  final String qrData;
  final double width;
  final double height;

  const CustomQRWidget({
    super.key,
    required this.textList,
    required this.qrData,
    required this.width,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.black, width: 1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: CustomPaint(
        painter: _CustomQRPainter(
          textList: textList,
          qrData: qrData,
        ),
      ),
    );
  }

  static Future<ui.Image> getImage({
    required List<TextInfo> textList,
    required String qrData,
    required double width,
    required double height,
  }) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final painter = _CustomQRPainter(
      textList: textList,
      qrData: qrData,
    );

    painter.paint(canvas, Size(width, height));
    final picture = recorder.endRecording();
    final img = await picture.toImage(width.round(), height.round());
    return img;
  }
}

class _CustomQRPainter extends CustomPainter {
  final List<TextInfo> textList;
  final String qrData;

  _CustomQRPainter({
    required this.textList,
    required this.qrData,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Dibuja un rectángulo para ver los límites del canvas
    final paint = Paint()..color = Colors.white.withOpacity(0.3);
    canvas.drawRect(Offset.zero & size, paint);

    // Dibujar los textos
    double dy = 0;
    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    for (var i = 0; i < textList.length; i++) {
      final textInfo = textList[i];
      textPainter.text = TextSpan(
        text: textInfo.text,
        style: TextStyle(fontSize: textInfo.fontSize, color: Colors.black, fontWeight: textInfo.isBold ? FontWeight.w800 : FontWeight.normal),
      );
      textPainter.layout();

      double dx;
      switch (textInfo.position) {
        case TextPosition.left:
          dx = 0;
          break;
        case TextPosition.center:
          dx = (size.width - textPainter.width) / 2;
          break;
        case TextPosition.right:
          dx = size.width - textPainter.width;
          break;
      }

      dy += (textPainter.height / 2);
      textPainter.paint(canvas, Offset(dx, dy));
    }

    // Dibujar el código QR
    final qrPainter = QrPainter(
      data: qrData,
      version: QrVersions.auto,
    );

    // Tamaño del código QR (ajusta esto según tus necesidades)
    final qrSize = size.width / 3; // Por ejemplo, un tercio del ancho del canvas

    // Actualiza el dy donde inicia a pintar el qr
    dy += qrSize / 2;

    // Calcular la posición para centrar el QR
    final qrOffset = Offset((size.width - qrSize) / 2, (size.height - qrSize) / 2);

    // Guardar el estado actual del canvas
    canvas.save();

    // Trasladar el canvas a la posición donde queremos dibujar el QR
    canvas.translate(qrOffset.dx, dy);

    // Dibujar el QR centrado
    qrPainter.paint(canvas, Size(qrSize, qrSize));

    // Restaurar el estado del canvas
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
