package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals

class ErrorMapperTest {
    private val mapper = ErrorMapper()

    @Test
    fun mapsKnownPrinterExceptionToStableCode() {
        val result = mapper.toOperationResult(PrinterException.PermissionDenied())
        assertEquals(false, result.ok)
        assertEquals("PermissionDenied", result.code)
    }

    @Test
    fun mapsUnknownExceptionToProtocolError() {
        val result = mapper.toOperationResult(IllegalStateException("boom"))
        assertEquals("ProtocolError", result.code)
    }
}
