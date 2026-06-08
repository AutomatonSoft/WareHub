package com.example.niimbot_label_printer

internal object B1ProtocolConstants {
    const val packetHead: Int = 0x55
    const val packetTail: Int = 0xAA

    const val cmdConnect: Int = 0xC1
    const val cmdAntiFake: Int = 0x0B
    const val cmdRfidInfo: Int = 0x1A
    const val cmdRfidInfo2: Int = 0x1C
    const val cmdPrinterInfo: Int = 0x40
    const val cmdPrintStatus: Int = 0xA3
    const val cmdSetDensity: Int = 0x21
    const val cmdSetLabelType: Int = 0x23
    const val cmdPrintStart: Int = 0x01
    const val cmdPageStart: Int = 0x03
    const val cmdSetPageSize: Int = 0x13
    const val cmdSetQuantity: Int = 0x15
    const val cmdPrintBitmapRow: Int = 0x85
    const val cmdPrintEmptyRow: Int = 0x84
    const val cmdPrintClear: Int = 0x20
    const val cmdCancelPrint: Int = 0xDA
    const val cmdHeartbeat: Int = 0xDC
    const val cmdPageEnd: Int = 0xE3
    const val cmdPrintEnd: Int = 0xF3

    const val respConnect: Int = 0xC2
    const val respAntiFake: Int = 0x0C
    const val respRfidInfo: Int = 0x1B
    const val respRfidInfo2: Int = 0x1D
    const val respPrinterInfoBase: Int = 0x40
    const val respPrintStatus: Int = 0xB3
    const val respSetDensity: Int = 0x31
    const val respSetLabelType: Int = 0x33
    const val respPrintStart: Int = 0x02
    const val respPageStart: Int = 0x04
    const val respSetPageSize: Int = 0x14
    const val respPrintClear: Int = 0x30
    const val respCancelPrint: Int = 0xD0
    const val respHeartbeatAdvanced1: Int = 0xDD
    const val respHeartbeatAdvanced2: Int = 0xD9
    const val respPageEnd: Int = 0xE4
    const val respPrintEnd: Int = 0xF4
    const val respPrintError: Int = 0xDB

    const val infoTypeModelId: Int = 8
    const val infoTypeSerialNumber: Int = 11
    const val infoTypeMac: Int = 13

    // NiimBlueLib modelsLibrary marks B1/B1_SE as 384 px printhead at 203dpi.
    const val b1PrintheadPixels: Int = 384
    const val defaultWidthDots: Int = 400
    const val defaultHeightDots: Int = 640
    const val defaultLabelType: Int = 1
    const val defaultDensity: Int = 3

    val supportedModelIds: Set<Int> = setOf(4096, 4098)
}

internal object PrinterTimeouts {
    const val commandTimeoutMs: Long = 2500L
    const val connectTimeoutMs: Long = 12000L
    const val statusPollIntervalMs: Long = 320L
    const val statusTimeoutMs: Long = 15000L
    const val interPacketDelayMs: Long = 6L
    const val recoveryPauseMs: Long = 220L
}

internal data class NiimbotFrame(
    val command: Int,
    val payload: ByteArray,
)

internal data class PrintStatus(
    val page: Int,
    val pagePrintProgress: Int,
    val pageFeedProgress: Int,
    val errorCode: Int,
    val raw: ByteArray,
)

internal data class PrinterInfo(
    val modelId: Int,
    val modelName: String,
    val serialNumber: String?,
    val bluetoothMac: String?,
)

internal data class RasterRow(
    val rowIndex: Int,
    val repeat: Int,
    val rowData: ByteArray?,
)

internal data class PrintTask(
    val rows: Int,
    val cols: Int,
    val density: Int,
    val labelType: Int,
    val rasterRows: List<RasterRow>,
    val debugReport: RasterDebugReport? = null,
)

internal data class RasterDebugReport(
    val packingMode: String,
    val bitOrder: String,
    val invertPackedBits: Boolean,
    val finalBitmapWidth: Int,
    val finalBitmapHeight: Int,
    val bytesPerRow: Int,
    val totalRows: Int,
    val totalBytes: Int,
    val blackPixels: Int,
    val whitePixels: Int,
    val blackFillPercent: Double,
    val firstRowsHex: List<String>,
    val lastRowsHex: List<String>,
    val artifactDirectory: String?,
    val sourceBitmapPath: String?,
    val resizedBitmapPath: String?,
    val rotatedBitmapPath: String?,
    val thresholdBitmapPath: String?,
    val finalPreparedBitmapPath: String?,
    val roundtripBitmapPath: String?,
    val roundtripMismatchCount: Int,
    val packedFirstNonEmptyRowsHex: List<String>,
    val unpackedFirstNonEmptyRowsHex: List<String>,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "packingMode" to packingMode,
        "bitOrder" to bitOrder,
        "invertPackedBits" to invertPackedBits,
        "finalBitmapWidth" to finalBitmapWidth,
        "finalBitmapHeight" to finalBitmapHeight,
        "bytesPerRow" to bytesPerRow,
        "totalRows" to totalRows,
        "totalBytes" to totalBytes,
        "blackPixels" to blackPixels,
        "whitePixels" to whitePixels,
        "blackFillPercent" to blackFillPercent,
        "firstRowsHex" to firstRowsHex,
        "lastRowsHex" to lastRowsHex,
        "artifactDirectory" to artifactDirectory,
        "sourceBitmapPath" to sourceBitmapPath,
        "resizedBitmapPath" to resizedBitmapPath,
        "rotatedBitmapPath" to rotatedBitmapPath,
        "thresholdBitmapPath" to thresholdBitmapPath,
        "finalPreparedBitmapPath" to finalPreparedBitmapPath,
        "roundtripBitmapPath" to roundtripBitmapPath,
        "roundtripMismatchCount" to roundtripMismatchCount,
        "packedFirstNonEmptyRowsHex" to packedFirstNonEmptyRowsHex,
        "unpackedFirstNonEmptyRowsHex" to unpackedFirstNonEmptyRowsHex,
    )
}
