package com.example.niimbot_label_printer

import java.nio.ByteBuffer

internal class CommandEncoder {
    enum class BitmapRowHeaderLayout {
        COUNTS_THEN_REPEAT,
        REPEAT_THEN_COUNTS,
    }

    fun connect(): ByteArray = frame(
        command = B1ProtocolConstants.cmdConnect,
        payload = byteArrayOf(0x01),
        connectPrefix = true,
    )

    fun antiFake(): ByteArray = frame(B1ProtocolConstants.cmdAntiFake, byteArrayOf(0x01))

    fun rfidInfo(): ByteArray = frame(B1ProtocolConstants.cmdRfidInfo, byteArrayOf(0x01))

    fun rfidInfo2(): ByteArray = frame(B1ProtocolConstants.cmdRfidInfo2, byteArrayOf(0x01))

    fun printerInfo(infoType: Int): ByteArray = frame(B1ProtocolConstants.cmdPrinterInfo, byteArrayOf(infoType.toByte()))

    fun printStatus(): ByteArray = frame(B1ProtocolConstants.cmdPrintStatus, byteArrayOf(0x01))

    fun setDensity(value: Int): ByteArray = frame(B1ProtocolConstants.cmdSetDensity, byteArrayOf(value.toByte()))

    fun setLabelType(value: Int): ByteArray = frame(B1ProtocolConstants.cmdSetLabelType, byteArrayOf(value.toByte()))

    fun printStart7b(totalPages: Int, pageColor: Int = 0): ByteArray {
        val payload = ByteBuffer.allocate(7)
            .putShort(totalPages.toShort())
            .put(0)
            .put(0)
            .put(0)
            .put(0)
            .put((pageColor and 0xFF).toByte())
            .array()
        return frame(B1ProtocolConstants.cmdPrintStart, payload)
    }

    fun printStart1b(): ByteArray = frame(B1ProtocolConstants.cmdPrintStart, byteArrayOf(0x01))

    fun printStart2b(totalPages: Int): ByteArray {
        val payload = ByteBuffer.allocate(2).putShort(totalPages.toShort()).array()
        return frame(B1ProtocolConstants.cmdPrintStart, payload)
    }

    fun printClear(): ByteArray = frame(B1ProtocolConstants.cmdPrintClear, byteArrayOf(0x01))

    fun cancelPrint(): ByteArray = frame(B1ProtocolConstants.cmdCancelPrint, byteArrayOf(0x01))

    fun heartbeatAdvanced1(): ByteArray = frame(B1ProtocolConstants.cmdHeartbeat, byteArrayOf(0x01))

    fun pageStart(): ByteArray = frame(B1ProtocolConstants.cmdPageStart, byteArrayOf(0x01))

    fun setDimension4b(rows: Int, cols: Int): ByteArray {
        val payload = ByteBuffer.allocate(4)
            .putShort(rows.toShort())
            .putShort(cols.toShort())
            .array()
        return frame(B1ProtocolConstants.cmdSetPageSize, payload)
    }

    fun setPageSize6b(rows: Int, cols: Int, copies: Int): ByteArray {
        val payload = ByteBuffer.allocate(6)
            .putShort(rows.toShort())
            .putShort(cols.toShort())
            .putShort(copies.toShort())
            .array()
        return frame(B1ProtocolConstants.cmdSetPageSize, payload)
    }

    fun setQuantity(quantity: Int): ByteArray {
        val payload = ByteBuffer.allocate(2).putShort(quantity.toShort()).array()
        return frame(B1ProtocolConstants.cmdSetQuantity, payload)
    }

    fun printBitmapRow(
        row: RasterRow,
        printheadPixels: Int,
        invertBits: Boolean = false,
        useSplitCount: Boolean = false,
        headerLayout: BitmapRowHeaderLayout = BitmapRowHeaderLayout.COUNTS_THEN_REPEAT,
        forceZeroCounts: Boolean = false,
    ): ByteArray {
        val source = row.rowData ?: ByteArray(0)
        val data = if (!invertBits) {
            source
        } else {
            ByteArray(source.size) { idx -> (source[idx].toInt() xor 0xFF).toByte() }
        }
        val counts = if (forceZeroCounts) {
            intArrayOf(0, 0, 0)
        } else if (useSplitCount) {
            countPixelsSplit(data, printheadPixels)
        } else {
            countPixelsTotal(data)
        }
        val payloadBuilder = ByteBuffer.allocate(6 + data.size)
            .putShort(row.rowIndex.toShort())
        when (headerLayout) {
            BitmapRowHeaderLayout.COUNTS_THEN_REPEAT -> {
                payloadBuilder
                    .put(counts[0].toByte())
                    .put(counts[1].toByte())
                    .put(counts[2].toByte())
                    .put(row.repeat.toByte())
            }
            BitmapRowHeaderLayout.REPEAT_THEN_COUNTS -> {
                payloadBuilder
                    .put(row.repeat.toByte())
                    .put(counts[0].toByte())
                    .put(counts[1].toByte())
                    .put(counts[2].toByte())
            }
        }
        val payload = payloadBuilder
            .put(data)
            .array()
        return frame(B1ProtocolConstants.cmdPrintBitmapRow, payload)
    }

    fun printEmptyRow(rowIndex: Int, repeat: Int): ByteArray {
        val payload = ByteBuffer.allocate(3)
            .putShort(rowIndex.toShort())
            .put(repeat.toByte())
            .array()
        return frame(B1ProtocolConstants.cmdPrintEmptyRow, payload)
    }

    fun pageEnd(): ByteArray = frame(B1ProtocolConstants.cmdPageEnd, byteArrayOf(0x01))

    fun printEnd(): ByteArray = frame(B1ProtocolConstants.cmdPrintEnd, byteArrayOf(0x01))

    fun frame(command: Int, payload: ByteArray, connectPrefix: Boolean = false): ByteArray {
        val size = payload.size
        var checksum = (command and 0xFF) xor size
        for (byte in payload) {
            checksum = checksum xor (byte.toInt() and 0xFF)
        }

        val body = ByteBuffer.allocate(2 + 1 + 1 + size + 1 + 2)
            .put(B1ProtocolConstants.packetHead.toByte())
            .put(B1ProtocolConstants.packetHead.toByte())
            .put((command and 0xFF).toByte())
            .put(size.toByte())
            .put(payload)
            .put((checksum and 0xFF).toByte())
            .put(B1ProtocolConstants.packetTail.toByte())
            .put(B1ProtocolConstants.packetTail.toByte())
            .array()

        return if (connectPrefix) {
            byteArrayOf(0x03) + body
        } else {
            body
        }
    }

    private fun countPixelsTotal(lineData: ByteArray): IntArray {
        var total = 0
        for (value in lineData) {
            total += Integer.bitCount(value.toInt() and 0xFF)
        }
        val hi = (total shr 8) and 0xFF
        val lo = total and 0xFF
        return intArrayOf(0, lo, hi)
    }

    private fun countPixelsSplit(lineData: ByteArray, printheadPixels: Int): IntArray {
        val bytesPerRow = (printheadPixels / 8).coerceAtLeast(1)
        val normalized = if (lineData.size == bytesPerRow) {
            lineData
        } else {
            ByteArray(bytesPerRow).also { dst ->
                val copy = minOf(dst.size, lineData.size)
                if (copy > 0) {
                    System.arraycopy(lineData, 0, dst, 0, copy)
                }
            }
        }

        val segmentBytes = (bytesPerRow / 3).coerceAtLeast(1)
        var c1 = 0
        var c2 = 0
        var c3 = 0
        for (idx in normalized.indices) {
            val bits = Integer.bitCount(normalized[idx].toInt() and 0xFF)
            when {
                idx < segmentBytes -> c1 += bits
                idx < segmentBytes * 2 -> c2 += bits
                else -> c3 += bits
            }
        }
        return intArrayOf(c1.coerceIn(0, 255), c2.coerceIn(0, 255), c3.coerceIn(0, 255))
    }
}
