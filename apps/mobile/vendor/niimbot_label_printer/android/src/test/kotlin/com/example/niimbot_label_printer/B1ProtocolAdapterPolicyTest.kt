package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class B1ProtocolAdapterPolicyTest {
    @Test
    fun labelTypeCandidates_whenExplicitTypeSelected_prioritizeRequestedType() {
        val candidates = B1ProtocolAdapter.buildLabelTypeCandidates(
            requestedLabelType = 1,
            detectedLabelTypes = listOf(5),
        )

        assertEquals(1, candidates.first())
    }

    @Test
    fun labelTypeCandidates_whenAutoMode_prioritizeDetectedType() {
        val candidates = B1ProtocolAdapter.buildLabelTypeCandidates(
            requestedLabelType = 0,
            detectedLabelTypes = listOf(5),
        )

        assertEquals(5, candidates.first())
    }

    @Test
    fun densityCandidates_forTransparentMedia_includeHighDensitiesForFallback() {
        val candidates = B1ProtocolAdapter.densityCandidatesForLabelType(
            requestedDensity = 5,
            labelType = 5,
        )

        assertEquals(5, candidates.first())
        assertTrue(candidates.contains(4))
        assertTrue(candidates.contains(5))
    }

    @Test
    fun densityCandidates_forTransparentMedia_keepRequestedDensityFirst() {
        val candidates = B1ProtocolAdapter.densityCandidatesForLabelType(
            requestedDensity = 3,
            labelType = 5,
        )

        assertEquals(3, candidates.first())
    }

    @Test
    fun packetDelay_forTransparentMedia_usesSlowerPacing() {
        val delayMs = B1ProtocolAdapter.packetDelayMsForLabelType(labelType = 5)
        assertEquals(B1ProtocolAdapter.transparentInterPacketDelayMs, delayMs)
    }

    @Test
    fun packetDelay_forRegularMedia_usesDefaultPacing() {
        val delayMs = B1ProtocolAdapter.packetDelayMsForLabelType(labelType = 1)
        assertEquals(PrinterTimeouts.interPacketDelayMs, delayMs)
    }

    @Test
    fun effectiveRasterLabelType_whenAutoTaskAndTransparentProfile_usesTransparentType() {
        val labelType = B1ProtocolAdapter.effectiveRasterLabelType(
            taskLabelType = 0,
            selectedLabelType = 5,
        )

        assertEquals(5, labelType)
    }

    @Test
    fun effectiveRasterLabelType_whenProfileMissing_fallsBackToTaskType() {
        val labelType = B1ProtocolAdapter.effectiveRasterLabelType(
            taskLabelType = 3,
            selectedLabelType = 0,
        )

        assertEquals(3, labelType)
    }

    @Test
    fun useSplitCountForLabelType_whenTransparentMedia_returnsTrue() {
        val useSplit = B1ProtocolAdapter.useSplitCountForLabelType(labelType = 5)
        assertEquals(true, useSplit)
    }

    @Test
    fun useZeroCountHeaderForLabelType_whenTransparentMedia_returnsTrue() {
        val useZeroCounts = B1ProtocolAdapter.useZeroCountHeaderForLabelType(labelType = 5)
        assertEquals(true, useZeroCounts)
    }

    @Test
    fun useZeroCountHeaderForLabelType_whenRegularMedia_returnsFalse() {
        val useZeroCounts = B1ProtocolAdapter.useZeroCountHeaderForLabelType(labelType = 1)
        assertEquals(false, useZeroCounts)
    }

    @Test
    fun bitmapRowHeaderLayout_whenTransparentMedia_usesCountsThenRepeat() {
        val layout = B1ProtocolAdapter.bitmapRowHeaderLayoutForLabelType(labelType = 5)
        assertEquals(CommandEncoder.BitmapRowHeaderLayout.COUNTS_THEN_REPEAT, layout)
    }

    @Test
    fun bitmapRowHeaderLayout_whenRegularMedia_usesCountsThenRepeat() {
        val layout = B1ProtocolAdapter.bitmapRowHeaderLayoutForLabelType(labelType = 1)
        assertEquals(CommandEncoder.BitmapRowHeaderLayout.COUNTS_THEN_REPEAT, layout)
    }

    @Test
    fun invertBitmapBitsForLabelType_whenTransparentMedia_returnsFalse() {
        val invertBits = B1ProtocolAdapter.invertBitmapBitsForLabelType(labelType = 5)
        assertEquals(false, invertBits)
    }

    @Test
    fun invertBitmapBitsForLabelType_whenRegularMedia_returnsFalse() {
        val invertBits = B1ProtocolAdapter.invertBitmapBitsForLabelType(labelType = 1)
        assertEquals(false, invertBits)
    }

    @Test
    fun clearModes_whenTransparentCandidatePresent_prefersNoClearFirst() {
        val modes = B1ProtocolAdapter.clearModesForLabelTypeCandidates(listOf(5, 1))
        assertEquals(listOf(false, true), modes)
    }

    @Test
    fun clearModes_whenTransparentCandidateMissing_prefersClearFirst() {
        val modes = B1ProtocolAdapter.clearModesForLabelTypeCandidates(listOf(1, 2))
        assertEquals(listOf(true, false), modes)
    }
}
