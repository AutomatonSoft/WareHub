package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

class CommandEncoderTest {
    private val encoder = CommandEncoder()

    @Test
    fun setDimension4b_encodesRowsThenCols() {
        val frame = encoder.setDimension4b(rows = 640, cols = 384)

        assertEquals(B1ProtocolConstants.cmdSetPageSize, frame[2].toInt() and 0xFF)
        assertEquals(4, frame[3].toInt() and 0xFF)
        assertContentEquals(
            byteArrayOf(0x02, 0x80.toByte(), 0x01, 0x80.toByte()),
            frame.copyOfRange(4, 8),
        )
    }

    @Test
    fun setPageSize6b_encodesRowsColsAndCopies() {
        val frame = encoder.setPageSize6b(rows = 640, cols = 384, copies = 1)

        assertEquals(B1ProtocolConstants.cmdSetPageSize, frame[2].toInt() and 0xFF)
        assertEquals(6, frame[3].toInt() and 0xFF)
        assertContentEquals(
            byteArrayOf(0x02, 0x80.toByte(), 0x01, 0x80.toByte(), 0x00, 0x01),
            frame.copyOfRange(4, 10),
        )
    }

    @Test
    fun printBitmapRow_invertsPayloadWhenRequested() {
        val row = RasterRow(
            rowIndex = 5,
            repeat = 1,
            rowData = byteArrayOf(0x00),
        )

        val frame = encoder.printBitmapRow(
            row = row,
            printheadPixels = 24,
            invertBits = true,
        )

        assertEquals(B1ProtocolConstants.cmdPrintBitmapRow, frame[2].toInt() and 0xFF)
        assertEquals(7, frame[3].toInt() and 0xFF)
        // rowIndex(2), counts(3), repeat(1), data(1)
        assertContentEquals(
            byteArrayOf(
                0x00, 0x05, // row index
                0x00, 0x08, 0x00, // counts for total mode [0, LL, HH]
                0x01, // repeat
                0xFF.toByte(), // inverted data
            ),
            frame.copyOfRange(4, 11),
        )
    }

    @Test
    fun printBitmapRow_usesTotalCountModeForB1Width() {
        val row = RasterRow(
            rowIndex = 0,
            repeat = 1,
            rowData = ByteArray(48) { 0xFF.toByte() }, // 384 black pixels
        )

        val frame = encoder.printBitmapRow(
            row = row,
            printheadPixels = 384,
            invertBits = false,
        )

        assertEquals(B1ProtocolConstants.cmdPrintBitmapRow, frame[2].toInt() and 0xFF)
        assertEquals(54, frame[3].toInt() and 0xFF)
        // rowIndex(2), counts(3), repeat(1)
        assertContentEquals(
            byteArrayOf(
                0x00, 0x00, // row index
                0x00, 0x80.toByte(), 0x01, // total black pixels = 384 => 0x0180
                0x01, // repeat
            ),
            frame.copyOfRange(4, 10),
        )
    }

    @Test
    fun printBitmapRow_usesSplitCountModeWhenRequested() {
        val row = RasterRow(
            rowIndex = 0,
            repeat = 1,
            rowData = ByteArray(48) { 0xFF.toByte() }, // 384 black pixels
        )

        val frame = encoder.printBitmapRow(
            row = row,
            printheadPixels = 384,
            invertBits = false,
            useSplitCount = true,
        )

        assertEquals(B1ProtocolConstants.cmdPrintBitmapRow, frame[2].toInt() and 0xFF)
        assertEquals(54, frame[3].toInt() and 0xFF)
        // rowIndex(2), counts(3), repeat(1)
        assertContentEquals(
            byteArrayOf(
                0x00, 0x00, // row index
                0x80.toByte(), 0x80.toByte(), 0x80.toByte(), // 128/128/128
                0x01, // repeat
            ),
            frame.copyOfRange(4, 10),
        )
    }

    @Test
    fun printBitmapRow_canEncodeRepeatBeforeCountsLayout() {
        val row = RasterRow(
            rowIndex = 2,
            repeat = 1,
            rowData = ByteArray(48) { 0xFF.toByte() }, // 384 black pixels
        )

        val frame = encoder.printBitmapRow(
            row = row,
            printheadPixels = 384,
            invertBits = false,
            useSplitCount = false,
            headerLayout = CommandEncoder.BitmapRowHeaderLayout.REPEAT_THEN_COUNTS,
        )

        assertEquals(B1ProtocolConstants.cmdPrintBitmapRow, frame[2].toInt() and 0xFF)
        assertEquals(54, frame[3].toInt() and 0xFF)
        assertContentEquals(
            byteArrayOf(
                0x00, 0x02, // row index
                0x01, // repeat
                0x00, 0x80.toByte(), 0x01, // total black pixels = 384 => 0x0180
            ),
            frame.copyOfRange(4, 10),
        )
    }

    @Test
    fun printBitmapRow_canForceZeroCounts() {
        val row = RasterRow(
            rowIndex = 7,
            repeat = 1,
            rowData = ByteArray(48) { 0xFF.toByte() },
        )

        val frame = encoder.printBitmapRow(
            row = row,
            printheadPixels = 384,
            invertBits = false,
            useSplitCount = false,
            forceZeroCounts = true,
        )

        assertEquals(B1ProtocolConstants.cmdPrintBitmapRow, frame[2].toInt() and 0xFF)
        assertEquals(54, frame[3].toInt() and 0xFF)
        assertContentEquals(
            byteArrayOf(
                0x00, 0x07, // row index
                0x00, 0x00, 0x00, // forced zero count bytes
                0x01, // repeat
            ),
            frame.copyOfRange(4, 10),
        )
    }
}
