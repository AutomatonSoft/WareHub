package com.example.niimbot_label_printer

import android.util.Log

internal class DiagnosticsLogger(private val tag: String = "NiimbotB1") {
    fun debug(stage: String, message: String) {
        if (!shouldLogDebug(stage, message)) {
            return
        }
        Log.d(tag, "[$stage] $message")
    }

    fun warn(stage: String, message: String) {
        Log.w(tag, "[$stage] $message")
    }

    fun error(stage: String, message: String, throwable: Throwable? = null) {
        if (throwable == null) {
            Log.e(tag, "[$stage] $message")
            return
        }
        Log.e(tag, "[$stage] $message", throwable)
    }

    private fun shouldLogDebug(stage: String, message: String): Boolean {
        if (stage != "PRINT") {
            return false
        }
        return message.startsWith("start ") || message == "completed"
    }
}
