package com.example.niimbot_label_printer

import kotlinx.coroutines.delay

internal class StatusMonitor(
    private val session: PrinterSession,
    private val encoder: CommandEncoder,
    private val decoder: ResponseDecoder,
    private val logger: DiagnosticsLogger,
) {
    suspend fun currentStatus(): PrintStatus {
        val frame = session.sendAndReceive(
            packet = encoder.printStatus(),
            expectedResponseIds = setOf(B1ProtocolConstants.respPrintStatus),
        )
        return decoder.parsePrintStatus(frame)
    }

    suspend fun waitUntilDone(totalPages: Int) {
        val deadline = System.currentTimeMillis() + PrinterTimeouts.statusTimeoutMs
        while (true) {
            val status = currentStatus()
            logger.debug(
                "STATUS",
                "page=${status.page} print=${status.pagePrintProgress} feed=${status.pageFeedProgress} error=${status.errorCode}",
            )
            if (status.errorCode != 0) {
                throw PrinterException.PrintTaskFailed(
                    "Printer reported non-zero print status error.",
                    mapOf("errorCode" to status.errorCode),
                )
            }
            if (isTerminalSuccessStatus(status, totalPages)) {
                return
            }
            if (System.currentTimeMillis() >= deadline) {
                throw PrinterException.StatusTimeout()
            }
            delay(PrinterTimeouts.statusPollIntervalMs)
        }
    }
}

internal fun isTerminalSuccessStatus(
    status: PrintStatus,
    totalPages: Int,
): Boolean {
    if (status.errorCode != 0) {
        return false
    }
    if (status.page >= totalPages && status.pagePrintProgress == 100 && status.pageFeedProgress == 100) {
        return true
    }
    // Some B1 firmware reports terminal success without incrementing page.
    return status.page == 0 && status.pagePrintProgress == 100 && status.pageFeedProgress == 100
}
