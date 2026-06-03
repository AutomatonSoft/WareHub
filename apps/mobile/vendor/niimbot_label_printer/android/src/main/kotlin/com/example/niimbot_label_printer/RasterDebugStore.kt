package com.example.niimbot_label_printer

import android.content.Context
import android.graphics.Bitmap
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

internal class RasterDebugStore(
    private val appContext: Context,
    private val logger: DiagnosticsLogger,
) {
    data class Session(
        val directory: File,
        var sourceBitmapPath: String? = null,
        var resizedBitmapPath: String? = null,
        var rotatedBitmapPath: String? = null,
        var thresholdBitmapPath: String? = null,
        var finalPreparedBitmapPath: String? = null,
    )

    fun createSession(prefix: String = "print"): Session {
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())
        val dir = File(appContext.cacheDir, "niimbot_b1_debug/${prefix}_${stamp}_${UUID.randomUUID()}")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        logger.debug("RASTER", "debug artifacts directory=${dir.absolutePath}")
        return Session(directory = dir)
    }

    fun saveBitmap(session: Session, fileName: String, bitmap: Bitmap): String? {
        return runCatching {
            val output = File(session.directory, fileName)
            FileOutputStream(output).use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            }
            output.absolutePath
        }.onFailure {
            logger.warn("RASTER", "failed to save bitmap $fileName: ${it.message}")
        }.getOrNull()
    }
}
