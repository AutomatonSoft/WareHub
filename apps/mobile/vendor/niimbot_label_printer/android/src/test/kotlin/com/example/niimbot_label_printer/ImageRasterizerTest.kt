package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ImageRasterizerTest {
    private val rasterizer = ImageRasterizer()

    private fun argb(a: Int, r: Int, g: Int, b: Int): Int {
        return ((a and 0xFF) shl 24) or
            ((r and 0xFF) shl 16) or
            ((g and 0xFF) shl 8) or
            (b and 0xFF)
    }

    @Test
    fun compressRows_mergesOnlyVoidRows() {
        val lines = listOf(
            byteArrayOf(0x00),
            byteArrayOf(0x00),
            byteArrayOf(0xF0.toByte()),
            byteArrayOf(0xF0.toByte()),
            byteArrayOf(0x0F),
        )

        val rows = rasterizer.compressRows(lines)
        assertEquals(4, rows.size)
        assertEquals(0, rows[0].rowIndex)
        assertEquals(2, rows[0].repeat)
        assertNull(rows[0].rowData)

        assertEquals(2, rows[1].rowIndex)
        assertEquals(1, rows[1].repeat)
        assertEquals(0xF0.toByte(), rows[1].rowData!![0])

        assertEquals(3, rows[2].rowIndex)
        assertEquals(1, rows[2].repeat)
        assertEquals(0xF0.toByte(), rows[2].rowData!![0])

        assertEquals(4, rows[3].rowIndex)
        assertEquals(1, rows[3].repeat)
        assertEquals(0x0F, rows[3].rowData!![0])
    }

    @Test
    fun isDarkPixel_usesLuminanceThreshold() {
        assertFalse(rasterizer.isDarkPixel(argb(255, 255, 255, 255)))
        assertFalse(rasterizer.isDarkPixel(argb(255, 180, 180, 180)))
        assertTrue(rasterizer.isDarkPixel(argb(255, 120, 120, 120)))
        assertTrue(rasterizer.isDarkPixel(argb(255, 0, 0, 0)))
    }

    @Test
    fun isDarkPixel_treatsTransparentPixelsAsWhite() {
        assertFalse(rasterizer.isDarkPixel(argb(0, 0, 0, 0)))
        assertFalse(rasterizer.isDarkPixel(argb(127, 0, 0, 0)))
        assertTrue(rasterizer.isDarkPixel(argb(128, 0, 0, 0)))
    }

    @Test
    fun bitMaskForX_usesMsbFirstWithinByte() {
        assertEquals(0x80, rasterizer.bitMaskForX(0))
        assertEquals(0x40, rasterizer.bitMaskForX(1))
        assertEquals(0x01, rasterizer.bitMaskForX(7))
        assertEquals(0x80, rasterizer.bitMaskForX(8))
    }

    @Test
    fun bitMaskForX_supportsLsbFirstWithinByte() {
        assertEquals(0x01, rasterizer.bitMaskForX(0, ImageRasterizer.BitOrder.LSB))
        assertEquals(0x02, rasterizer.bitMaskForX(1, ImageRasterizer.BitOrder.LSB))
        assertEquals(0x80, rasterizer.bitMaskForX(7, ImageRasterizer.BitOrder.LSB))
        assertEquals(0x01, rasterizer.bitMaskForX(8, ImageRasterizer.BitOrder.LSB))
    }

    @Test
    fun compressRows_usesLogicalRowsForVoidDetectionWhenPackedIsInverted() {
        val logicalRows = listOf(
            byteArrayOf(0x00),
            byteArrayOf(0x00),
            byteArrayOf(0x0F),
        )
        val packedRows = listOf(
            byteArrayOf(0xFF.toByte()),
            byteArrayOf(0xFF.toByte()),
            byteArrayOf(0xF0.toByte()),
        )

        val rows = rasterizer.compressRows(packedRows = packedRows, logicalRows = logicalRows)
        assertEquals(2, rows.size)
        assertEquals(0, rows[0].rowIndex)
        assertEquals(2, rows[0].repeat)
        assertNull(rows[0].rowData)
        assertEquals(2, rows[1].rowIndex)
        assertEquals(1, rows[1].repeat)
        assertEquals(0xF0.toByte(), rows[1].rowData!![0])
    }

    @Test
    fun trimVerticalWhitespace_keepsInkWithMargins() {
        val lines = MutableList(200) { byteArrayOf(0x00) }
        for (i in 60..89) {
            lines[i][0] = 0x7F
        }

        val trimmed = rasterizer.trimVerticalWhitespace(lines)
        assertEquals(120, trimmed.size)
        assertTrue(trimmed.any { (it[0].toInt() and 0xFF) == 0x7F })
    }

    @Test
    fun toUncompressedRows_emitsBitmapRowForEachInputRow() {
        val packedRows = listOf(
            byteArrayOf(0x00),
            byteArrayOf(0x00),
            byteArrayOf(0x0F),
        )

        val rows = rasterizer.toUncompressedRows(packedRows)
        assertEquals(3, rows.size)
        assertEquals(0, rows[0].rowIndex)
        assertEquals(1, rows[0].repeat)
        assertEquals(0x00, rows[0].rowData!![0].toInt() and 0xFF)
        assertEquals(1, rows[1].rowIndex)
        assertEquals(1, rows[1].repeat)
        assertEquals(0x00, rows[1].rowData!![0].toInt() and 0xFF)
        assertEquals(2, rows[2].rowIndex)
        assertEquals(1, rows[2].repeat)
        assertEquals(0x0F, rows[2].rowData!![0].toInt() and 0xFF)
    }
}
