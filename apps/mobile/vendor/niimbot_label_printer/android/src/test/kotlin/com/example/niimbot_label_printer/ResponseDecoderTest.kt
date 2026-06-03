package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals

class ResponseDecoderTest {
    private val encoder = CommandEncoder()
    private val decoder = ResponseDecoder()

    @Test
    fun decodeFrame_parsesCommandAndPayload() {
        val raw = encoder.frame(command = 0xB3, payload = byteArrayOf(0x00, 0x01, 100.toByte(), 100.toByte()))
        val frame = decoder.decodeFrame(raw)

        assertEquals(0xB3, frame.command)
        assertEquals(4, frame.payload.size)
    }

    @Test
    fun parsePrintStatus_readsProgressFields() {
        val frame = NiimbotFrame(
            command = 0xB3,
            payload = byteArrayOf(0x00, 0x01, 80.toByte(), 90.toByte()),
        )
        val status = decoder.parsePrintStatus(frame)

        assertEquals(1, status.page)
        assertEquals(80, status.pagePrintProgress)
        assertEquals(90, status.pageFeedProgress)
        assertEquals(0, status.errorCode)
    }
}
