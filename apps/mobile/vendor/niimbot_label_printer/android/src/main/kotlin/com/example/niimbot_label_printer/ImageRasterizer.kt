package com.example.niimbot_label_printer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import kotlin.math.max
import kotlin.math.min

internal class ImageRasterizer(
    private val debugStore: RasterDebugStore? = null,
    private val logger: DiagnosticsLogger? = null,
) {
    private companion object {
        // Production defaults: use row compression and trim white vertical margins
        // to reduce transfer time and accelerate print start.
        const val disableEmptyRowCompression = false
        // Keep full label height to avoid cropped/partial output on some B1 firmware/media.
        const val disableVerticalTrim = true
    }

    enum class BitOrder {
        MSB,
        LSB,
    }

    data class PackingOptions(
        val bitOrder: BitOrder = BitOrder.MSB,
        val invertPackedBits: Boolean = false,
    ) {
        val modeName: String
            get() = "${bitOrder.name}_${if (invertPackedBits) "INVERT" else "NO_INVERT"}"

        companion object {
            fun fromInputs(
                modeRaw: String?,
                bitOrderRaw: String?,
                invertPackedBitsRaw: Boolean?,
            ): PackingOptions {
                val normalizedMode = modeRaw?.trim()?.uppercase()
                if (!normalizedMode.isNullOrEmpty()) {
                    return when (normalizedMode) {
                        "MSB_NO_INVERT" -> PackingOptions(bitOrder = BitOrder.MSB, invertPackedBits = false)
                        "MSB_INVERT" -> PackingOptions(bitOrder = BitOrder.MSB, invertPackedBits = true)
                        "LSB_NO_INVERT" -> PackingOptions(bitOrder = BitOrder.LSB, invertPackedBits = false)
                        "LSB_INVERT" -> PackingOptions(bitOrder = BitOrder.LSB, invertPackedBits = true)
                        else -> fromInputs(modeRaw = null, bitOrderRaw = bitOrderRaw, invertPackedBitsRaw = invertPackedBitsRaw)
                    }
                }

                val bitOrder = when (bitOrderRaw?.trim()?.uppercase()) {
                    "LSB", "LSB_FIRST" -> BitOrder.LSB
                    else -> BitOrder.MSB
                }
                return PackingOptions(
                    bitOrder = bitOrder,
                    invertPackedBits = invertPackedBitsRaw ?: false,
                )
            }
        }
    }

    data class RasterizationResult(
        val cols: Int,
        val rows: List<RasterRow>,
        val debugReport: RasterDebugReport,
    )

    fun rasterize(
        rawBytes: ByteArray,
        width: Int,
        height: Int,
        rotate: Boolean,
        invertColor: Boolean,
        packingOptions: PackingOptions = PackingOptions(),
    ): RasterizationResult {
        val session = debugStore?.createSession(prefix = "raster")

        val sourceBitmap = decodeBitmap(rawBytes, width, height)
        session?.let { debugStore?.saveBitmap(it, "00_before_scale.png", sourceBitmap) }
        session?.sourceBitmapPath = session?.let { debugStore?.saveBitmap(it, "01_source.png", sourceBitmap) }

        val cols = normalizeWidth()
        val rowsCanvas = normalizeHeight(height, sourceBitmap.height)
        val widthReq = cols
        val heightReq = rowsCanvas

        val rotatedBitmap = if (rotate) {
            val matrix = Matrix().apply { postRotate(90f) }
            Bitmap.createBitmap(sourceBitmap, 0, 0, sourceBitmap.width, sourceBitmap.height, matrix, true)
        } else {
            sourceBitmap
        }
        session?.rotatedBitmapPath = session?.let { debugStore?.saveBitmap(it, "02_rotated.png", rotatedBitmap) }

        logger?.debug(
            "SCALE",
            "sourceBitmap=${sourceBitmap.width}x${sourceBitmap.height} targetW=$widthReq targetH=$heightReq",
        )
        val resizedBitmap = scaleToFit(rotatedBitmap, widthReq, heightReq)
        session?.let { debugStore?.saveBitmap(it, "00b_after_scale.png", resizedBitmap) }
        session?.resizedBitmapPath = session?.let { debugStore?.saveBitmap(it, "03_resized.png", resizedBitmap) }

        val preparedBitmap = placeOnWhiteCanvas(resizedBitmap, cols, rowsCanvas, invertColor)
        session?.finalPreparedBitmapPath = session?.let { debugStore?.saveBitmap(it, "04_prepared.png", preparedBitmap) }

        val thresholdBitmap = binarize(preparedBitmap)
        session?.thresholdBitmapPath = session?.let { debugStore?.saveBitmap(it, "05_threshold.png", thresholdBitmap) }

        val normalizedRows = monochromeRowsFromBinary(
            bitmap = thresholdBitmap,
            bitOrder = packingOptions.bitOrder,
        )
        val rowsForTransfer = if (disableVerticalTrim) normalizedRows else trimVerticalWhitespace(normalizedRows)
        val packedTrimmedRows = applyPackedInversion(rowsForTransfer, packingOptions.invertPackedBits)
        val compressedRows = compressRows(
            packedRows = packedTrimmedRows,
            logicalRows = rowsForTransfer,
        )
        val rasterRows = if (disableEmptyRowCompression) {
            toUncompressedRows(packedTrimmedRows)
        } else {
            compressedRows
        }
        logger?.debug(
            "RASTER",
            "rowCompression disabled=$disableEmptyRowCompression verticalTrimDisabled=$disableVerticalTrim rowsBefore=${packedTrimmedRows.size} rowsCompressed=${compressedRows.size} rowsUsed=${rasterRows.size}",
        )
        val finalRows = rowsForTransfer.size
        val roundtripBitmap = unpackRowsToBitmap(
            packedRows = packedTrimmedRows,
            width = cols,
            bitOrder = packingOptions.bitOrder,
            invertPackedBits = packingOptions.invertPackedBits,
        )
        val roundtripNormalizedRows = monochromeRowsFromBinary(
            bitmap = roundtripBitmap,
            bitOrder = packingOptions.bitOrder,
        )
        val roundtripMismatchCount = mismatchPixels(rowsForTransfer, roundtripNormalizedRows)
        val roundtripPath = session?.let { debugStore?.saveBitmap(it, "06_roundtrip_from_packed.png", roundtripBitmap) }

        val debugReport = buildDebugReport(
            cols = cols,
            rows = finalRows,
            normalizedRows = rowsForTransfer,
            packedRows = packedTrimmedRows,
            session = session,
            packingOptions = packingOptions,
            roundtripBitmapPath = roundtripPath,
            roundtripMismatchCount = roundtripMismatchCount,
            unpackedRows = roundtripNormalizedRows,
        )
        logDebugReport(debugReport)

        return RasterizationResult(
            cols = cols,
            rows = rasterRows,
            debugReport = debugReport,
        )
    }

    internal fun toUncompressedRows(packedRows: List<ByteArray>): List<RasterRow> {
        if (packedRows.isEmpty()) return emptyList()
        val output = ArrayList<RasterRow>(packedRows.size)
        for ((index, row) in packedRows.withIndex()) {
            output += RasterRow(
                rowIndex = index,
                repeat = 1,
                rowData = row,
            )
        }
        return output
    }

    internal fun trimVerticalWhitespace(
        lines: List<ByteArray>,
        keepTopMarginRows: Int = 8,
        keepBottomMarginRows: Int = 24,
        minimumRows: Int = 120,
    ): List<ByteArray> {
        if (lines.isEmpty()) return lines

        fun isEmptyRow(row: ByteArray): Boolean = row.all { it.toInt() == 0 }

        val firstInk = lines.indexOfFirst { !isEmptyRow(it) }
        if (firstInk == -1) {
            return lines.take(minimumRows.coerceAtMost(lines.size))
        }
        val lastInk = lines.indexOfLast { !isEmptyRow(it) }

        var start = (firstInk - keepTopMarginRows).coerceAtLeast(0)
        var endExclusive = (lastInk + keepBottomMarginRows + 1).coerceAtMost(lines.size)

        if (endExclusive - start < minimumRows) {
            val missing = minimumRows - (endExclusive - start)
            val growUp = missing / 2
            val growDown = missing - growUp
            start = (start - growUp).coerceAtLeast(0)
            endExclusive = (endExclusive + growDown).coerceAtMost(lines.size)
            if (endExclusive - start < minimumRows) {
                if (start == 0) {
                    endExclusive = minimumRows.coerceAtMost(lines.size)
                } else if (endExclusive == lines.size) {
                    start = (lines.size - minimumRows).coerceAtLeast(0)
                }
            }
        }

        return lines.subList(start, endExclusive)
    }

    internal fun compressRows(lines: List<ByteArray>): List<RasterRow> = compressRows(lines, lines)

    internal fun compressRows(
        packedRows: List<ByteArray>,
        logicalRows: List<ByteArray>,
    ): List<RasterRow> {
        if (packedRows.isEmpty()) return emptyList()
        if (packedRows.size != logicalRows.size) {
            throw IllegalArgumentException("packedRows and logicalRows must have the same size.")
        }

        val output = mutableListOf<RasterRow>()
        var index = 0
        while (index < packedRows.size) {
            val packed = packedRows[index]
            val logical = logicalRows[index]
            val isVoid = logical.all { it.toInt() == 0 }
            if (!isVoid) {
                output += RasterRow(
                    rowIndex = index,
                    repeat = 1,
                    rowData = packed,
                )
                index++
                continue
            }

            var repeat = 1
            while (index + repeat < packedRows.size && repeat < 255) {
                val nextLogical = logicalRows[index + repeat]
                if (!nextLogical.all { it.toInt() == 0 }) {
                    break
                }
                repeat++
            }

            output += RasterRow(
                rowIndex = index,
                repeat = repeat,
                rowData = null,
            )
            index += repeat
        }
        return output
    }

    internal fun bitMaskForX(x: Int, bitOrder: BitOrder = BitOrder.MSB): Int {
        return when (bitOrder) {
            BitOrder.MSB -> 1 shl (7 - (x % 8))
            BitOrder.LSB -> 1 shl (x % 8)
        }
    }

    internal fun isDarkPixel(pixel: Int): Boolean {
        val alpha = (pixel ushr 24) and 0xFF
        if (alpha < 128) return false

        val red = (pixel ushr 16) and 0xFF
        val green = (pixel ushr 8) and 0xFF
        val blue = pixel and 0xFF
        val luminance = (red * 299 + green * 587 + blue * 114) / 1000
        return luminance < 170
    }

    private fun decodeBitmap(bytes: ByteArray, width: Int, height: Int): Bitmap {
        if (width > 0 && height > 0 && bytes.size == width * height * 4) {
            return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also {
                it.copyPixelsFromBuffer(java.nio.ByteBuffer.wrap(bytes))
            }
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw PrinterException.PrintTaskFailed("Could not decode image payload.")
    }

    private fun normalizeWidth(): Int = B1ProtocolConstants.b1PrintheadPixels

    private fun normalizeHeight(requested: Int, bitmapHeight: Int): Int {
        val base = if (requested > 0) requested else bitmapHeight
        return (if (base > 0) base else B1ProtocolConstants.defaultHeightDots).coerceIn(120, 2000)
    }

    private fun scaleToFit(src: Bitmap, targetW: Int, targetH: Int): Bitmap {
        val scale = min(targetW / src.width.toFloat(), targetH / src.height.toFloat())
        val outW = max(1, (src.width * scale).toInt())
        val outH = max(1, (src.height * scale).toInt())
        val out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint().apply {
            isAntiAlias = false
            isFilterBitmap = false
            isDither = false
        }
        canvas.drawBitmap(
            src,
            Rect(0, 0, src.width, src.height),
            Rect(0, 0, outW, outH),
            paint,
        )
        return out
    }

    private fun placeOnWhiteCanvas(
        content: Bitmap,
        width: Int,
        height: Int,
        invertColor: Boolean,
    ): Bitmap {
        val canvasBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(canvasBitmap)
        canvas.drawColor(Color.WHITE)
        val left = (width - content.width) / 2f
        val top = (height - content.height) / 2f
        canvas.drawBitmap(
            if (invertColor) content.invert() else content,
            left,
            top,
            Paint().apply {
                isAntiAlias = false
                isFilterBitmap = false
                isDither = false
            },
        )
        return canvasBitmap
    }

    private fun binarize(bitmap: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        for (y in 0 until bitmap.height) {
            for (x in 0 until bitmap.width) {
                val black = isDarkPixel(bitmap.getPixel(x, y))
                out.setPixel(x, y, if (black) Color.BLACK else Color.WHITE)
            }
        }
        return out
    }

    private fun monochromeRowsFromBinary(
        bitmap: Bitmap,
        bitOrder: BitOrder,
    ): List<ByteArray> {
        val lines = ArrayList<ByteArray>(bitmap.height)
        for (y in 0 until bitmap.height) {
            val row = ByteArray(bitmap.width / 8)
            for (x in 0 until bitmap.width) {
                val pixel = bitmap.getPixel(x, y)
                val isBlack = (pixel and 0x00FFFFFF) == 0
                if (!isBlack) continue
                val byteIndex = x / 8
                val bitMask = bitMaskForX(x, bitOrder)
                row[byteIndex] = (row[byteIndex].toInt() or bitMask).toByte()
            }
            lines += row
        }
        return lines
    }

    private fun applyPackedInversion(rows: List<ByteArray>, invertPackedBits: Boolean): List<ByteArray> {
        if (!invertPackedBits) return rows
        return rows.map { row ->
            ByteArray(row.size) { idx -> (row[idx].toInt() xor 0xFF).toByte() }
        }
    }

    private fun unpackRowsToBitmap(
        packedRows: List<ByteArray>,
        width: Int,
        bitOrder: BitOrder,
        invertPackedBits: Boolean,
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(width, packedRows.size, Bitmap.Config.ARGB_8888)
        for (y in packedRows.indices) {
            val row = packedRows[y]
            for (x in 0 until width) {
                val byteIndex = x / 8
                val rawByte = row[byteIndex].toInt() and 0xFF
                val normalizedByte = if (invertPackedBits) rawByte xor 0xFF else rawByte
                val bitMask = bitMaskForX(x, bitOrder)
                val isBlack = (normalizedByte and bitMask) != 0
                bitmap.setPixel(x, y, if (isBlack) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
    }

    private fun mismatchPixels(originalRows: List<ByteArray>, roundtripRows: List<ByteArray>): Int {
        if (originalRows.size != roundtripRows.size) {
            return Int.MAX_VALUE
        }
        var mismatch = 0
        for (rowIndex in originalRows.indices) {
            val original = originalRows[rowIndex]
            val roundtrip = roundtripRows[rowIndex]
            if (original.size != roundtrip.size) {
                return Int.MAX_VALUE
            }
            for (byteIndex in original.indices) {
                mismatch += Integer.bitCount((original[byteIndex].toInt() xor roundtrip[byteIndex].toInt()) and 0xFF)
            }
        }
        return mismatch
    }

    private fun firstNonEmptyRowsHex(rows: List<ByteArray>, maxRows: Int = 10, prefixBytes: Int = 8): List<String> {
        val output = mutableListOf<String>()
        for ((index, row) in rows.withIndex()) {
            if (row.all { it.toInt() == 0 }) continue
            val prefix = row.take(prefixBytes).joinToString(" ") { "%02x".format(it.toInt() and 0xFF) }
            output += "row=$index bytes=$prefix"
            if (output.size >= maxRows) break
        }
        return output
    }

    private fun buildDebugReport(
        cols: Int,
        rows: Int,
        normalizedRows: List<ByteArray>,
        packedRows: List<ByteArray>,
        session: RasterDebugStore.Session?,
        packingOptions: PackingOptions,
        roundtripBitmapPath: String?,
        roundtripMismatchCount: Int,
        unpackedRows: List<ByteArray>,
    ): RasterDebugReport {
        val bytesPerRow = cols / 8
        val totalBytes = rows * bytesPerRow

        var blackPixels = 0
        for (row in normalizedRows) {
            blackPixels += row.sumOf { byte -> Integer.bitCount(byte.toInt() and 0xFF) }
        }
        val whitePixels = cols * rows - blackPixels
        val blackFillPercent = if (cols == 0 || rows == 0) 0.0 else (blackPixels * 100.0) / (cols * rows)

        val firstRowsHex = packedRows.take(10).map(ByteArray::toHex)
        val lastRowsHex = packedRows.takeLast(10).map(ByteArray::toHex)
        val packedFirstNonEmptyRowsHex = firstNonEmptyRowsHex(packedRows)
        val unpackedFirstNonEmptyRowsHex = firstNonEmptyRowsHex(unpackedRows)

        return RasterDebugReport(
            packingMode = packingOptions.modeName,
            bitOrder = packingOptions.bitOrder.name,
            invertPackedBits = packingOptions.invertPackedBits,
            finalBitmapWidth = cols,
            finalBitmapHeight = rows,
            bytesPerRow = bytesPerRow,
            totalRows = rows,
            totalBytes = totalBytes,
            blackPixels = blackPixels,
            whitePixels = whitePixels,
            blackFillPercent = blackFillPercent,
            firstRowsHex = firstRowsHex,
            lastRowsHex = lastRowsHex,
            artifactDirectory = session?.directory?.absolutePath,
            sourceBitmapPath = session?.sourceBitmapPath,
            resizedBitmapPath = session?.resizedBitmapPath,
            rotatedBitmapPath = session?.rotatedBitmapPath,
            thresholdBitmapPath = session?.thresholdBitmapPath,
            finalPreparedBitmapPath = session?.finalPreparedBitmapPath,
            roundtripBitmapPath = roundtripBitmapPath,
            roundtripMismatchCount = roundtripMismatchCount,
            packedFirstNonEmptyRowsHex = packedFirstNonEmptyRowsHex,
            unpackedFirstNonEmptyRowsHex = unpackedFirstNonEmptyRowsHex,
        )
    }

    private fun logDebugReport(report: RasterDebugReport) {
        val log = logger ?: return
        log.debug(
            "RASTER",
                "finalBitmap width=${report.finalBitmapWidth} height=${report.finalBitmapHeight} bytesPerRow=${report.bytesPerRow} totalRows=${report.totalRows} totalBytes=${report.totalBytes}",
        )
        log.debug(
            "RASTER",
            "packingMode=${report.packingMode} bitOrder=${report.bitOrder} invertPackedBits=${report.invertPackedBits} roundtripMismatch=${report.roundtripMismatchCount}",
        )
        log.debug(
            "RASTER",
            "pixelStats black=${report.blackPixels} white=${report.whitePixels} blackFillPercent=${"%.2f".format(report.blackFillPercent)}",
        )
        report.firstRowsHex.forEachIndexed { index, hex ->
            log.debug("RASTER", "firstRows[$index]=$hex")
        }
        report.lastRowsHex.forEachIndexed { index, hex ->
            log.debug("RASTER", "lastRows[$index]=$hex")
        }
        report.packedFirstNonEmptyRowsHex.forEachIndexed { index, line ->
            log.debug("RASTER", "packedFirstNonEmpty[$index]=$line")
        }
        report.unpackedFirstNonEmptyRowsHex.forEachIndexed { index, line ->
            log.debug("RASTER", "unpackedFirstNonEmpty[$index]=$line")
        }
        log.debug(
            "RASTER",
            "artifacts dir=${report.artifactDirectory} source=${report.sourceBitmapPath} resized=${report.resizedBitmapPath} rotated=${report.rotatedBitmapPath} threshold=${report.thresholdBitmapPath} prepared=${report.finalPreparedBitmapPath} roundtrip=${report.roundtripBitmapPath}",
        )
    }

    private fun Bitmap.invert(): Bitmap {
        val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint()
        paint.colorFilter = ColorMatrixColorFilter(
            ColorMatrix(
                floatArrayOf(
                    -1f, 0f, 0f, 0f, 255f,
                    0f, -1f, 0f, 0f, 255f,
                    0f, 0f, -1f, 0f, 255f,
                    0f, 0f, 0f, 1f, 0f,
                )
            )
        )
        canvas.drawBitmap(this, 0f, 0f, paint)
        return out
    }
}
