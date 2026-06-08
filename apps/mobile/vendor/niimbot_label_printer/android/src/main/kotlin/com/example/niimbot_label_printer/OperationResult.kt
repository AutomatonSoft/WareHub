package com.example.niimbot_label_printer

internal data class OperationResult(
    val ok: Boolean,
    val code: String,
    val message: String,
    val details: Map<String, Any?> = emptyMap(),
) {
    fun toMap(): Map<String, Any?> = linkedMapOf(
        "ok" to ok,
        "code" to code,
        "message" to message,
        "details" to details,
    )

    companion object {
        fun success(message: String = "OK", details: Map<String, Any?> = emptyMap()): OperationResult =
            OperationResult(ok = true, code = "OK", message = message, details = details)
    }
}
