package com.example.niimbot_label_printer

internal data class PrinterFailure(
    val code: String,
    override val message: String,
    val details: Map<String, Any?> = emptyMap(),
) : RuntimeException(message)

internal sealed class PrinterException(
    val errorCode: String,
    message: String,
    val errorDetails: Map<String, Any?> = emptyMap(),
) : RuntimeException(message) {
    class BluetoothUnavailable : PrinterException("BluetoothUnavailable", "Bluetooth adapter is unavailable.")
    class PermissionDenied : PrinterException("PermissionDenied", "Bluetooth permission is denied.")
    class DeviceNotFound(address: String) : PrinterException(
        "DeviceNotFound",
        "Bluetooth device not found.",
        mapOf("address" to address),
    )
    class ConnectionFailed(message: String, details: Map<String, Any?> = emptyMap()) : PrinterException(
        "ConnectionFailed",
        message,
        details,
    )
    class HandshakeFailed(message: String) : PrinterException("HandshakeFailed", message)
    class ProtocolError(message: String, details: Map<String, Any?> = emptyMap()) : PrinterException(
        "ProtocolError",
        message,
        details,
    )
    class PrinterBusy : PrinterException("PrinterBusy", "Printer has active print task.")
    class PrintTaskFailed(message: String, details: Map<String, Any?> = emptyMap()) : PrinterException(
        "PrintTaskFailed",
        message,
        details,
    )
    class StatusTimeout : PrinterException("StatusTimeout", "Timed out while waiting printer status confirmation.")
    class UnsupportedPrinterModel(modelId: Int) : PrinterException(
        "UnsupportedPrinterModel",
        "Printer model is not supported by B1 adapter.",
        mapOf("modelId" to modelId),
    )
    class DisconnectedDuringPrint : PrinterException(
        "DisconnectedDuringPrint",
        "Printer disconnected during print task.",
    )
}
