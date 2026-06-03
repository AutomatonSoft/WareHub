package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SessionResponsePolicyTest {
    @Test
    fun throwsProtocolErrorForUnsupportedCommandZero() {
        val error = assertFailsWith<PrinterException.ProtocolError> {
            SessionResponsePolicy.throwIfFailure(
                frame = NiimbotFrame(command = 0x00, payload = byteArrayOf(0x01)),
                expectedResponseIds = setOf(B1ProtocolConstants.respSetLabelType),
                rawHex = "555500010100aaaa",
            )
        }
        assertEquals("ProtocolError", error.errorCode)
    }

    @Test
    fun throwsPrintTaskFailedForPrinterErrorFrame() {
        val error = assertFailsWith<PrinterException.PrintTaskFailed> {
            SessionResponsePolicy.throwIfFailure(
                frame = NiimbotFrame(command = B1ProtocolConstants.respPrintError, payload = byteArrayOf(0x14)),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrintStart),
                rawHex = "5555db0114ceaaaa",
            )
        }
        assertEquals("PrintTaskFailed", error.errorCode)
        assertTrue(error.message!!.contains("0x14"))
    }
}
