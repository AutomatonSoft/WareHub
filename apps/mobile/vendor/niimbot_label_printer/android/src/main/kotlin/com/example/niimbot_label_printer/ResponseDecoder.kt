package com.example.niimbot_label_printer

import java.nio.charset.Charset

internal class ResponseDecoder {
    fun decodeFrame(raw: ByteArray): NiimbotFrame {
        if (raw.size < 7) {
            throw PrinterException.ProtocolError("Frame is too short.")
        }
        if ((raw[0].toInt() and 0xFF) != B1ProtocolConstants.packetHead ||
            (raw[1].toInt() and 0xFF) != B1ProtocolConstants.packetHead
        ) {
            throw PrinterException.ProtocolError("Invalid frame header.")
        }
        if ((raw[raw.lastIndex - 1].toInt() and 0xFF) != B1ProtocolConstants.packetTail ||
            (raw[raw.lastIndex].toInt() and 0xFF) != B1ProtocolConstants.packetTail
        ) {
            throw PrinterException.ProtocolError("Invalid frame footer.")
        }

        val command = raw[2].toInt() and 0xFF
        val len = raw[3].toInt() and 0xFF
        val expectedSize = 2 + 1 + 1 + len + 1 + 2
        if (expectedSize != raw.size) {
            throw PrinterException.ProtocolError("Frame length mismatch.", mapOf("expected" to expectedSize, "actual" to raw.size))
        }
        val payload = if (len == 0) ByteArray(0) else raw.copyOfRange(4, 4 + len)
        val checksum = raw[4 + len].toInt() and 0xFF

        var expectedChecksum = command xor len
        for (byte in payload) {
            expectedChecksum = expectedChecksum xor (byte.toInt() and 0xFF)
        }
        if (checksum != (expectedChecksum and 0xFF)) {
            throw PrinterException.ProtocolError("Frame checksum mismatch.")
        }

        return NiimbotFrame(command = command, payload = payload)
    }

    fun parsePrintStatus(frame: NiimbotFrame): PrintStatus {
        if (frame.command != B1ProtocolConstants.respPrintStatus || frame.payload.size < 4) {
            throw PrinterException.ProtocolError("Unsupported print status response.")
        }
        val page = u16(frame.payload[0], frame.payload[1])
        val printProgress = frame.payload[2].toInt() and 0xFF
        val feedProgress = frame.payload[3].toInt() and 0xFF
        val errorCode = if (frame.payload.size >= 10) frame.payload[6].toInt() and 0xFF else 0

        return PrintStatus(
            page = page,
            pagePrintProgress = printProgress,
            pageFeedProgress = feedProgress,
            errorCode = errorCode,
            raw = frame.payload,
        )
    }

    fun parsePrinterModelId(frame: NiimbotFrame): Int {
        val payload = frame.payload
        if (payload.isEmpty()) {
            throw PrinterException.ProtocolError("Printer model payload is empty.")
        }
        return if (payload.size == 1) {
            (payload[0].toInt() and 0xFF) shl 8
        } else {
            u16(payload[0], payload[1])
        }
    }

    fun parsePrinterInfoText(frame: NiimbotFrame): String? {
        if (frame.payload.isEmpty()) return null
        return frame.payload.toString(Charset.defaultCharset()).trim().ifBlank { null }
    }

    private fun u16(high: Byte, low: Byte): Int {
        return ((high.toInt() and 0xFF) shl 8) or (low.toInt() and 0xFF)
    }
}
