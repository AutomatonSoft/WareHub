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
        // TX/RX dump the full hex payload of every single command - for a
        // multi-hundred-row print that floods logcat, so keep those out.
        // Everything else is one line per call and is exactly what's needed
        // to tell where a print actually stalls or fails.
        return stage != "TX" && stage != "RX"
    }
}
