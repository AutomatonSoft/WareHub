package com.example.niimbot_label_printer

internal class ErrorMapper {
    fun toOperationResult(error: Throwable): OperationResult {
        return when (error) {
            is PrinterException -> OperationResult(
                ok = false,
                code = error.errorCode,
                message = error.message ?: error.errorCode,
                details = error.errorDetails,
            )
            else -> OperationResult(
                ok = false,
                code = "ProtocolError",
                message = error.message ?: "Unexpected printer error.",
                details = emptyMap(),
            )
        }
    }
}
