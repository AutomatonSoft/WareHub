package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals

internal class NiimbotLabelPrinterPluginTest {
    @Test
    fun operationResult_toMapContainsStableKeys() {
        val result = OperationResult.success(message = "ok", details = mapOf("a" to 1)).toMap()
        assertEquals(true, result["ok"])
        assertEquals("OK", result["code"])
    }
}
