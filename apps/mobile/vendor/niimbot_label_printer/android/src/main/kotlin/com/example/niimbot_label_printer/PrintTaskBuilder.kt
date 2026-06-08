package com.example.niimbot_label_printer

internal class PrintTaskBuilder(
    private val rasterizer: ImageRasterizer,
    private val logger: DiagnosticsLogger,
) {
    fun build(payload: Map<*, *>): PrintTask {
        val bytes = (payload["bytes"] as? List<*>)
            ?.mapNotNull { (it as? Number)?.toInt()?.toByte() }
            ?.toByteArray()
            ?: throw PrinterException.PrintTaskFailed("Print payload bytes are missing.")

        val width = (payload["width"] as? Number)?.toInt() ?: B1ProtocolConstants.defaultWidthDots
        val height = (payload["height"] as? Number)?.toInt() ?: B1ProtocolConstants.defaultHeightDots
        val rotate = (payload["rotate"] as? Boolean) ?: false
        val labelType = ((payload["labelType"] as? Number)?.toInt() ?: B1ProtocolConstants.defaultLabelType).coerceIn(0, 5)
        val requestedInvert = (payload["invertColor"] as? Boolean) ?: false
        val invert = normalizeInvert(requestedInvert = requestedInvert, labelType = labelType)
        val requestedDensity =
            ((payload["density"] as? Number)?.toInt() ?: B1ProtocolConstants.defaultDensity).coerceIn(1, 5)
        val density = normalizeDensity(requestedDensity = requestedDensity, labelType = labelType)
        val packingOptionsRaw = ImageRasterizer.PackingOptions.fromInputs(
            modeRaw = payload["packingMode"]?.toString(),
            bitOrderRaw = payload["bitOrder"]?.toString(),
            invertPackedBitsRaw = payload["invertPackedBits"] as? Boolean,
        )
        val packingOptions = normalizePackingOptions(
            requested = packingOptionsRaw,
            labelType = labelType,
            hasExplicitMode = payload["packingMode"] != null,
            hasExplicitBitOrder = payload["bitOrder"] != null,
            hasExplicitInvertPackedBits = payload["invertPackedBits"] != null,
        )

        val raster = rasterizer.rasterize(
            rawBytes = bytes,
            width = width,
            height = height,
            rotate = rotate,
            invertColor = invert,
            packingOptions = packingOptions,
        )
        val cols = raster.cols
        val rowsData = raster.rows

        val rows = rowsData.lastOrNull()?.let { it.rowIndex + it.repeat } ?: raster.debugReport.totalRows
        logger.debug(
            "RASTER",
            "task ready cols=$cols rows=$rows payloadBytes=${bytes.size} widthReq=$width heightReq=$height rotate=$rotate invert=$invert labelType=$labelType density=$density packingMode=${packingOptions.modeName}",
        )

        return PrintTask(
            rows = rows,
            cols = cols,
            density = density,
            labelType = labelType,
            rasterRows = rowsData,
            debugReport = raster.debugReport,
        )
    }

    internal companion object {
        internal fun normalizeDensity(requestedDensity: Int, labelType: Int): Int {
            // Keep user-selected density. Some transparent consumables on B1
            // require higher density to become visible.
            return requestedDensity
        }

        @Suppress("UNUSED_PARAMETER")
        internal fun normalizeInvert(requestedInvert: Boolean, labelType: Int): Boolean {
            // Keep caller polarity. Auto-flipping for transparent stock causes
            // overfilled raster on some B1 firmware/media combinations.
            return requestedInvert
        }

        internal fun normalizePackingOptions(
            requested: ImageRasterizer.PackingOptions,
            labelType: Int,
            hasExplicitMode: Boolean,
            hasExplicitBitOrder: Boolean,
            hasExplicitInvertPackedBits: Boolean,
        ): ImageRasterizer.PackingOptions {
            val hasExplicitPacking = hasExplicitMode || hasExplicitBitOrder || hasExplicitInvertPackedBits
            if (hasExplicitPacking) return requested
            // Keep canonical B1 packing defaults (MSB + no inversion).
            // This matches known-good open-source implementations.
            return requested
        }
    }
}

