import 'dart:async';
import 'dart:ui' as ui;
import 'dart:ui';
import 'package:flutter/rendering.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:niimbot_label_printer/niimbot_label_printer.dart';
import 'package:niimbot_label_printer_example/custom_canvas_widget.dart';

void main() {
  runApp(const Apps());
}

class Apps extends StatelessWidget {
  const Apps({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: MyApp(),
    );
  }
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final TextEditingController txttext = TextEditingController();
  final TextEditingController txtwidth = TextEditingController(text: '50');
  final TextEditingController txtheight = TextEditingController(text: '30');
  final TextEditingController txtpixelformm = TextEditingController(text: '8');
  bool rotate = false;
  bool invertColor = false;
  int density = 3; //1 and 5
  int labelType = 1; // 1 and 3

  String _msj = 'Unknown';
  final NiimbotLabelPrinter _niimbotLabelPrinterPlugin = NiimbotLabelPrinter();
  List<BluetoothDevice> _devices = [];
  String macConnection = '';
  bool connecting = false;

  bool customImage = true;
  final globalKey = GlobalKey();
  List<TextInfo> texts = [];
  ui.Image? _image;
  double _width = 400;
  double _height = 240;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    txtwidth.dispose();
    txtheight.dispose();
    txtpixelformm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Status: $_msj'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (String value) async {
              switch (value) {
                case "permission_is_granted":
                  final bool result = await _niimbotLabelPrinterPlugin.requestPermissionGrant();
                  setState(() {
                    _msj = result ? 'Permission is granted' : 'Permission is not granted';
                  });
                  break;
                case "bluetooth_is_enabled":
                  final bool result = await _niimbotLabelPrinterPlugin.bluetoothIsEnabled();
                  setState(() {
                    _msj = result ? 'Bluetooth is enabled' : 'Bluetooth is not enabled';
                  });
                  break;
                case "is_connected":
                  final bool result = await _niimbotLabelPrinterPlugin.isConnected();
                  setState(() {
                    _msj = result ? 'Bluetooth is connected' : 'Bluetooth is not connected';
                  });
                  break;
                case "get_paired_devices":
                  final List<BluetoothDevice> result = await _niimbotLabelPrinterPlugin.getPairedDevices();
                  _devices = result;
                  setState(() {
                    _msj = "Devices ${result.length}";
                  });
                  break;
                case "disconnect":
                  final bool result = await _niimbotLabelPrinterPlugin.disconnect();
                  setState(() {
                    _msj = result ? 'Disconnected' : 'Not disconnected';
                  });
                  break;
              }
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: "permission_is_granted",
                child: Text("Permission is granted"),
              ),
              const PopupMenuItem<String>(
                value: "bluetooth_is_enabled",
                child: Text("Bluetooth is enabled"),
              ),
              const PopupMenuItem<String>(
                value: "is_connected",
                child: Text("Is connected"),
              ),
              const PopupMenuItem<String>(
                value: "get_paired_devices",
                child: Text("Get paired devices"),
              ),
              const PopupMenuItem<String>(
                value: "disconnect",
                child: Text("Disconnect"),
              ),
            ],
          )
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(8.0),
        child: SingleChildScrollView(
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: () async {
                      modalCustomImage(context);
                    },
                    child: const Text('Toggle custom image'),
                  ),
                  TextButton(
                    onPressed: () async {
                      _image = await loadImage("assets/2.png");
                      setState(() {});
                    },
                    child: const Text('Toggle image assets'),
                  ),
                ],
              ),
              _image != null
                  ? Column(
                      children: [
                        Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.black, width: 1),
                          ),
                          child: RawImage(image: _image!, width: _width, height: _height),
                        ),
                        Text("image. width: ${_image!.width}, height: ${_image!.height}"),
                      ],
                    )
                  : const SizedBox(),
              Visibility(
                visible: _image != null,
                child: Column(
                  children: [
                    Slider(
                      max: 3,
                      min: 1,
                      divisions: 2,
                      label: "Label type: ${labelType.toInt()}",
                      value: labelType.toDouble(),
                      onChanged: (value) {
                        setState(() {
                          labelType = value.toInt();
                        });
                      },
                    ),
                    Slider(
                      max: 5,
                      min: 1,
                      divisions: 4,
                      label: "Density: ${density.toInt()}",
                      value: density.toDouble(),
                      onChanged: (value) {
                        setState(() {
                          density = value.toInt();
                        });
                      },
                    ),
                    Row(
                      children: [
                        SizedBox(
                          width: 200,
                          child: CheckboxListTile(
                            value: rotate,
                            controlAffinity: ListTileControlAffinity.leading,
                            onChanged: (value) {
                              setState(() {
                                rotate = value!;
                                setState(() {});
                              });
                            },
                            title: const Text('Rotated'),
                          ),
                        ),
                        ElevatedButton(
                          onPressed: () async {
                            final bool isConnected = await _niimbotLabelPrinterPlugin.isConnected();
                            if (!isConnected) {
                              setState(() {
                                _msj = 'Not connected';
                              });
                              return;
                            }

                            ui.Image image = _image!;

                            ByteData? byteData = await image.toByteData();
                            List<int> bytesImage = byteData!.buffer.asUint8List().toList();
                            Map<String, dynamic> datosImagen = {
                              "bytes": bytesImage,
                              "width": image.width,
                              "height": image.height,
                              "rotate": rotate,
                              "invertColor": invertColor,
                              "density": density,
                              "labelType": labelType,
                            };
                            PrintData printData = PrintData.fromMap(datosImagen);
                            final bool result = await _niimbotLabelPrinterPlugin.send(printData);
                            setState(() {
                              _msj = result ? 'Printed' : 'Not printed';
                            });
                          },
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                          child: const Text('Print image', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 200,
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _devices.length,
                  itemBuilder: (BuildContext context, int index) {
                    BluetoothDevice device = _devices[index];
                    return ListTile(
                      selected: device.address == macConnection,
                      title: Text(device.name),
                      subtitle: Text(device.address),
                      leading: Visibility(
                        visible: connecting && device.address == macConnection,
                        child: const CircularProgressIndicator(strokeWidth: 1),
                      ),
                      onTap: () async {
                        setState(() {
                          connecting = true;
                          macConnection = device.address;
                        });
                        bool result = await _niimbotLabelPrinterPlugin.connect(device);
                        setState(() {
                          _msj = result ? 'Connected' : 'Not connected';
                          macConnection = device.address;
                          connecting = false;
                        });
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void modalCustomImage(BuildContext context) async {
    double textSize = 10;
    bool isBold = false;
    bool isCenter = false;

    await showDialog(
      context: context,
      builder: (BuildContext context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            content: StatefulBuilder(
              builder: (BuildContext context, StateSetter setState) {
                return SizedBox(
                  width: MediaQuery.of(context).size.width,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text("Donate in PayPal", textAlign: TextAlign.center, style: TextStyle(fontSize: 20, color: Colors.black)),
                            IconButton(
                              onPressed: () {
                                Navigator.pop(context);
                              },
                              icon: const Icon(Icons.close),
                            ),
                          ],
                        ),
                        CustomQRWidget(
                          textList: texts,
                          qrData: "www.example.com",
                          width: _width,
                          height: _height,
                        ),
                        TextButton(
                          onPressed: () {
                            setState(() {
                              texts.clear();
                              txttext.clear();
                            });
                          },
                          child: const Text("Clear all"),
                        ),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: txttext,
                                decoration: const InputDecoration(labelText: 'Text'),
                              ),
                            ),
                            TextButton(
                              onPressed: () {
                                setState(() {
                                  texts.add(
                                    TextInfo(
                                      text: txttext.text,
                                      fontSize: textSize,
                                      position: isCenter ? TextPosition.center : TextPosition.left,
                                      isBold: isBold,
                                    ),
                                  );
                                  txttext.clear();
                                });
                              },
                              child: const Text("Add text"),
                            ),
                          ],
                        ),
                        Text("fontSize: ${textSize.toInt()}"),
                        Slider(
                          value: textSize,
                          min: 10,
                          max: 90,
                          onChanged: (value) {
                            setState(() {
                              textSize = value;
                            });
                          },
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            SizedBox(
                              width: 140,
                              child: CheckboxListTile(
                                value: isBold,
                                dense: true,
                                controlAffinity: ListTileControlAffinity.leading,
                                onChanged: (value) {
                                  setState(() {
                                    isBold = value!;
                                    setState(() {});
                                  });
                                },
                                title: const Text('Bold'),
                              ),
                            ),
                            SizedBox(
                              width: 140,
                              child: CheckboxListTile(
                                value: isCenter,
                                dense: true,
                                controlAffinity: ListTileControlAffinity.leading,
                                onChanged: (value) {
                                  setState(() {
                                    isCenter = value!;
                                    setState(() {});
                                  });
                                },
                                title: const Text('Center'),
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey, width: 1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text("Size label to print", style: TextStyle(fontSize: 8)),
                              const Text("The image can be created with a specific size and rotated before printing.", style: TextStyle(fontSize: 8)),
                              Row(
                                children: [
                                  SizedBox(
                                    width: 100,
                                    child: TextField(
                                      controller: txtwidth,
                                      decoration: const InputDecoration(labelText: 'Width mm'),
                                    ),
                                  ),
                                  SizedBox(
                                    width: 100,
                                    child: TextField(
                                      controller: txtheight,
                                      decoration: const InputDecoration(labelText: 'Height mm'),
                                    ),
                                  ),
                                ],
                              ),
                              SizedBox(
                                width: 200,
                                child: TextField(
                                  controller: txtpixelformm,
                                  decoration: const InputDecoration(labelText: 'Pixels per mm'),
                                ),
                              ),
                              ElevatedButton(
                                onPressed: () async {
                                  updateSize();
                                  _image = await CustomQRWidget.getImage(
                                    textList: texts,
                                    qrData: "www.example.com",
                                    width: _width,
                                    height: _height,
                                  );
                                  if (context.mounted) Navigator.pop(context);
                                },
                                style: ElevatedButton.styleFrom(backgroundColor: Colors.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                                child: const Text('Create image', style: TextStyle(color: Colors.white)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        );
      },
    );

    setState(() {});
  }

  void updateSize() {
    int? width = int.tryParse(txtwidth.text);
    int? height = int.tryParse(txtheight.text);
    int? pixels = int.tryParse(txtpixelformm.text);
    if (width != null && height != null && pixels != null) {
      _width = width * pixels.toDouble();
      _height = height * pixels.toDouble();
      setState(() {});
    }
  }

  Future<ui.Image> resizeImage(ui.Image image, double targetWidth, double targetHeight) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    // Escala la imagen
    final paint = Paint();
    final scaleX = targetWidth / image.width;
    final scaleY = targetHeight / image.height;

    canvas.scale(scaleX, scaleY);
    canvas.drawImage(image, Offset.zero, paint);

    final resizedImage = await recorder.endRecording().toImage(
          targetWidth.toInt(),
          targetHeight.toInt(),
        );

    return resizedImage;
  }

  Future<ui.Image> loadImage(String asset) async {
    final ByteData data = await rootBundle.load(asset);
    final Uint8List bytes = data.buffer.asUint8List();
    final Completer<ui.Image> completer = Completer();
    ui.decodeImageFromList(bytes, (ui.Image img) {
      //print("Image loaded, size: ${img.width}x${img.height}");
      completer.complete(img);
    });

    return completer.future;
  }
}
