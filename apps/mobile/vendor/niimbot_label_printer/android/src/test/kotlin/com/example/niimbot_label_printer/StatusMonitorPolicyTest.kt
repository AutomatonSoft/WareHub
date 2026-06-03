package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class StatusMonitorPolicyTest {
    @Test
    fun statusTimeoutIsFailFast() {
        assertEquals(15_000L, PrinterTimeouts.statusTimeoutMs)
    }

    @Test
    fun terminalSuccessWhenPageNotIncrementedButProgressComplete() {
        val status = PrintStatus(
            page = 0,
            pagePrintProgress = 100,
            pageFeedProgress = 100,
            errorCode = 0,
            raw = byteArrayOf(),
        )
        assertTrue(isTerminalSuccessStatus(status, totalPages = 1))
    }

    @Test
    fun notTerminalWhenProgressIncomplete() {
        val status = PrintStatus(
            page = 0,
            pagePrintProgress = 100,
            pageFeedProgress = 0,
            errorCode = 0,
            raw = byteArrayOf(),
        )
        assertFalse(isTerminalSuccessStatus(status, totalPages = 1))
    }
}
