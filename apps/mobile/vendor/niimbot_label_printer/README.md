# NiimbotLabelPrinter

`NiimbotLabelPrinter` is a Flutter package that enables printing labels using Niimbot label printers. This package provides a simple interface to connect to a Niimbot printer via Bluetooth, manage connections, and send print data.

## Features

- Request Bluetooth permissions.
- Check if Bluetooth is enabled.
- Connect and disconnect from a Niimbot printer.
- Retrieve paired Bluetooth devices.
- Send print data to the printer.

## Installation

Add `niimbot_label_printer` to your `pubspec.yaml`:

```yaml
dependencies:
  niimbot_label_printer: ^0.0.1
```

## Usage

To use the `NiimbotLabelPrinter` plugin, follow these steps:

1. Request Bluetooth permissions:
```dart
final bool result = await NiimbotLabelPrinter.requestPermissionGrant();
```
2. Check if Bluetooth is enabled:
```dart
final bool result = await NiimbotLabelPrinter.bluetoothIsEnabled();
```
3. Connect to a Niimbot printer:
```dart
final bool result = await NiimbotLabelPrinter.connect(device);
```
4. Disconnect from a Niimbot printer:
```dart
final bool result = await NiimbotLabelPrinter.disconnect();
```
5. Retrieve paired Bluetooth devices:
```dart
final List<BluetoothDevice> devices = await NiimbotLabelPrinter.getPairedDevices();
```
6. Send print data to the printer:
```dart
final bool result = await NiimbotLabelPrinter.send(printData);
```
7. Desconnect from a Niimbot printer:
```dart
final bool result = await NiimbotLabelPrinter.disconnect();
```

## QR Code Generation

To generate QR codes, you should use the `qr_flutter` library. Add the following dependency to your `pubspec.yaml`:

```yaml
dependencies:
  qr_flutter: ^4.1.0
```

## API Reference

### Methods

| Method                      | Description                                                   |
|-----------------------------|---------------------------------------------------------------|
| `getPlatformVersion()`       | Returns the platform version of the device.                   |
| `requestPermissionGrant()`   | Requests Bluetooth permission and checks if it's granted.     |
| `bluetoothIsEnabled()`       | Checks if Bluetooth is enabled on the device.                 |
| `isConnected()`              | Checks if the device is connected to a Niimbot printer.       |
| `getPairedDevices()`         | Returns a list of paired Bluetooth devices.                   |
| `connect(BluetoothDevice)`   | Connects to a specified Bluetooth device.                     |
| `disconnect()`               | Disconnects from the currently connected Bluetooth device.    |
| `send(PrintData)`            | Sends print data to the connected Niimbot printer.            |


### Class: PrintData

| Parameter      | Type       | Description                                                                   |
|----------------|------------|-------------------------------------------------------------------------------|
| `data`         | `List<int>`| A list of integers representing the raw print data.                           |
| `width`        | `int`      | The width of the label in pixels.                                             |
| `height`       | `int`      | The height of the label in pixels.                                            |
| `rotate`       | `bool`     | Indicates whether the label should be rotated before printing.                |
| `invertColor`  | `bool`     | Indicates whether the colors should be inverted before printing.              |
| `density`      | `int`      | The density of the label.                                                     |
| `labelType`    | `int`      | The type of label.                                                            |

---
## Example

In the example, you can print an image from the assets or create an image dynamically. 

- To print an image from the assets, load the image using `AssetImage` and capture the widget.
- To create an image, use widgets like `QrImage` to generate content dynamically and then capture the widget.

Both methods allow you to generate the image you want to print and send it to the printer.


---
## Foto

Here is an example of how the label looks:

![Print label](https://github.com/andresperezmelo/niimbot_label_printer/blob/main/label.jpg)

![Print label assets](https://github.com/andresperezmelo/niimbot_label_printer/blob/main/file.png)

![Create label](https://github.com/andresperezmelo/niimbot_label_printer/blob/main/file_custom.png)

![Create label](https://github.com/andresperezmelo/niimbot_label_printer/blob/main/file_2.png)

---
## Created With

This package was created using the following technologies:

- [Flutter](https://flutter.dev)
- [Dart](https://dart.dev)
- [Kotlin](https://kotlinlang.org)

---

Created with ❤️ by [andresperezmelo](https://github.com/andresperezmelo) 😊
[Andres Perez Melo](https://www.linkedin.com/in/andr%C3%A9s-p%C3%A9rez-melo-756413218/)
