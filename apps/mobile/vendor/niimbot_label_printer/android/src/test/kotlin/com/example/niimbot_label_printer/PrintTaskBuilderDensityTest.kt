package com.example.niimbot_label_printer

import kotlin.test.Test
import kotlin.test.assertEquals

class PrintTaskBuilderDensityTest {
    @Test
    fun normalizeDensity_keepsRequestedForTransparentMedia() {
        val normalized = PrintTaskBuilder.normalizeDensity(requestedDensity = 5, labelType = 5)
        assertEquals(5, normalized)
    }

    @Test
    fun normalizeDensity_keepsRequestedForNonTransparentMedia() {
        val normalized = PrintTaskBuilder.normalizeDensity(requestedDensity = 5, labelType = 1)
        assertEquals(5, normalized)
    }

    @Test
    fun normalizeInvert_keepsRequestedForTransparentMedia() {
        assertEquals(false, PrintTaskBuilder.normalizeInvert(requestedInvert = false, labelType = 5))
        assertEquals(true, PrintTaskBuilder.normalizeInvert(requestedInvert = true, labelType = 5))
    }

    @Test
    fun normalizeInvert_keepsRequestedForNonTransparentMedia() {
        assertEquals(false, PrintTaskBuilder.normalizeInvert(requestedInvert = false, labelType = 1))
        assertEquals(true, PrintTaskBuilder.normalizeInvert(requestedInvert = true, labelType = 1))
    }

    @Test
    fun normalizePackingOptions_keepsMsbForTransparentWhenNotExplicit() {
        val normalized = PrintTaskBuilder.normalizePackingOptions(
            requested = ImageRasterizer.PackingOptions(
                bitOrder = ImageRasterizer.BitOrder.MSB,
                invertPackedBits = false,
            ),
            labelType = 5,
            hasExplicitMode = false,
            hasExplicitBitOrder = false,
            hasExplicitInvertPackedBits = false,
        )
        assertEquals(ImageRasterizer.BitOrder.MSB, normalized.bitOrder)
        assertEquals(false, normalized.invertPackedBits)
    }

    @Test
    fun normalizePackingOptions_keepsRequestedWhenExplicitBitOrderProvided() {
        val normalized = PrintTaskBuilder.normalizePackingOptions(
            requested = ImageRasterizer.PackingOptions(
                bitOrder = ImageRasterizer.BitOrder.MSB,
                invertPackedBits = false,
            ),
            labelType = 5,
            hasExplicitMode = false,
            hasExplicitBitOrder = true,
            hasExplicitInvertPackedBits = false,
        )
        assertEquals(ImageRasterizer.BitOrder.MSB, normalized.bitOrder)
        assertEquals(false, normalized.invertPackedBits)
    }

    @Test
    fun normalizePackingOptions_keepsMsbForAutoLabelTypeWhenNotExplicit() {
        val normalized = PrintTaskBuilder.normalizePackingOptions(
            requested = ImageRasterizer.PackingOptions(
                bitOrder = ImageRasterizer.BitOrder.MSB,
                invertPackedBits = false,
            ),
            labelType = 0,
            hasExplicitMode = false,
            hasExplicitBitOrder = false,
            hasExplicitInvertPackedBits = false,
        )
        assertEquals(ImageRasterizer.BitOrder.MSB, normalized.bitOrder)
        assertEquals(false, normalized.invertPackedBits)
    }
}
