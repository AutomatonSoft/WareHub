package com.example.niimbot_label_printer

import kotlinx.coroutines.delay

internal class B1ProtocolAdapter(
    private val session: PrinterSession,
    private val encoder: CommandEncoder,
    private val decoder: ResponseDecoder,
    private val statusMonitor: StatusMonitor,
    private val logger: DiagnosticsLogger,
) {
    private var cachedMediaProfile: Pair<Int, Int>? = null

    private data class RfidProbe(
        val source: String,
        val labelType: Int?,
        val payloadHex: String,
    )

    suspend fun initialize(): PrinterInfo {
        session.initializeHandshake(encoder)

        val modelFrame = session.sendAndReceive(
            packet = encoder.printerInfo(B1ProtocolConstants.infoTypeModelId),
            expectedResponseIds = setOf(B1ProtocolConstants.respPrinterInfoBase + B1ProtocolConstants.infoTypeModelId),
        )
        val modelId = decoder.parsePrinterModelId(modelFrame)
        if (modelId !in B1ProtocolConstants.supportedModelIds) {
            throw PrinterException.UnsupportedPrinterModel(modelId)
        }

        val serial = runCatching {
            session.sendAndReceive(
                packet = encoder.printerInfo(B1ProtocolConstants.infoTypeSerialNumber),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrinterInfoBase + B1ProtocolConstants.infoTypeSerialNumber),
            )
        }.getOrNull()?.let(decoder::parsePrinterInfoText)

        val mac = runCatching {
            session.sendAndReceive(
                packet = encoder.printerInfo(B1ProtocolConstants.infoTypeMac),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrinterInfoBase + B1ProtocolConstants.infoTypeMac),
            )
        }.getOrNull()?.payload?.reversedArray()?.joinToString(":") { "%02X".format(it.toInt() and 0xFF) }

        val info = PrinterInfo(
            modelId = modelId,
            modelName = if (modelId == 4096) "B1" else "B1_SE",
            serialNumber = serial,
            bluetoothMac = mac,
        )
        logger.debug("SESSION", "Initialized model=${info.modelName} id=${info.modelId}")
        return info
    }

    suspend fun getStatus(): PrintStatus = statusMonitor.currentStatus()

    suspend fun print(task: PrintTask): OperationResult {
        logger.debug(
            "PRINT",
            "start rows=${task.rows} cols=${task.cols} density=${task.density} commands=${task.rasterRows.size}",
        )
        task.debugReport?.let { debug ->
            logger.debug(
                "PRINT",
                "rasterDebug mode=${debug.packingMode} bitOrder=${debug.bitOrder} invertPackedBits=${debug.invertPackedBits} width=${debug.finalBitmapWidth} height=${debug.finalBitmapHeight} bytesPerRow=${debug.bytesPerRow} totalRows=${debug.totalRows} totalBytes=${debug.totalBytes} roundtripMismatch=${debug.roundtripMismatchCount} blackFill=${"%.2f".format(debug.blackFillPercent)}%",
            )
        }
        ensureReadyForPrint()

        val selectedProfile = startWithMediaProfile(task)
        logger.debug(
            "PRINT",
            "media profile selected labelType=${selectedProfile.first} density=${selectedProfile.second}",
        )
        val effectiveLabelType = effectiveRasterLabelType(
            taskLabelType = task.labelType,
            selectedLabelType = selectedProfile.first,
        )

        session.sendAndReceive(
            packet = encoder.pageStart(),
            expectedResponseIds = setOf(B1ProtocolConstants.respPageStart),
        )
        // start page first, then set page dimensions (rows, cols).
        val sizeRows = task.rows
        val sizeCols = task.cols
        logger.debug(
            "PRINT",
            "setPageSize payloadRows=$sizeRows payloadCols=$sizeCols logicalRows=${task.rows} logicalCols=${task.cols} labelType=$effectiveLabelType",
        )
        session.sendAndReceive(
            packet = encoder.setPageSize6b(rows = sizeRows, cols = sizeCols, copies = 1),
            expectedResponseIds = setOf(B1ProtocolConstants.respSetPageSize),
        )

        val useSplitCount = useSplitCountForLabelType(effectiveLabelType)
        val rowHeaderLayout = bitmapRowHeaderLayoutForLabelType(effectiveLabelType)
        val zeroCountHeader = useZeroCountHeaderForLabelType(effectiveLabelType)
        val invertBitmapBits = invertBitmapBitsForLabelType(effectiveLabelType)
        logger.debug(
            "PRINT",
            "rowEncoding labelType=$effectiveLabelType layout=$rowHeaderLayout splitCounts=$useSplitCount zeroCounts=$zeroCountHeader invertBits=$invertBitmapBits",
        )
        var bitmapRowsSent = 0
        var emptyRowsSentAs84 = 0
        var emptyRowsSentAs85 = 0
        val zeroRowData = ByteArray(B1ProtocolConstants.b1PrintheadPixels / 8)
        for (row in task.rasterRows) {
            if (row.rowData == null && effectiveLabelType == 5) {
                // Some B1 firmware revisions corrupt long runs encoded by 0x84 on
                // transparent media. Send explicit 0x85 empty raster rows instead.
                for (offset in 0 until row.repeat) {
                    val packet = encoder.printBitmapRow(
                        row = RasterRow(
                            rowIndex = row.rowIndex + offset,
                            repeat = 1,
                            rowData = zeroRowData,
                        ),
                        printheadPixels = B1ProtocolConstants.b1PrintheadPixels,
                        invertBits = invertBitmapBits,
                        useSplitCount = useSplitCount,
                        headerLayout = rowHeaderLayout,
                        forceZeroCounts = zeroCountHeader,
                    )
                    session.sendOneWay(packet)
                    bitmapRowsSent += 1
                    emptyRowsSentAs85 += 1
                    delay(packetDelayMsForLabelType(effectiveLabelType))
                    if ((row.rowIndex + offset) > 0 && (row.rowIndex + offset) % transparentThrottleEveryRows == 0) {
                        delay(transparentThrottlePauseMs)
                    }
                }
                continue
            }

            val packet = if (row.rowData == null) {
                emptyRowsSentAs84 += row.repeat
                encoder.printEmptyRow(row.rowIndex, row.repeat)
            } else {
                encoder.printBitmapRow(
                    row = row,
                    printheadPixels = B1ProtocolConstants.b1PrintheadPixels,
                    // B1 expects "black pixel = bit 1" in row payload. Inverting here
                    // causes negative output and often blank-looking labels.
                    invertBits = invertBitmapBits,
                    useSplitCount = useSplitCount,
                    headerLayout = rowHeaderLayout,
                    forceZeroCounts = zeroCountHeader,
                )
            }
            session.sendOneWay(packet)
            if (row.rowData != null) {
                bitmapRowsSent += 1
            }
            delay(packetDelayMsForLabelType(effectiveLabelType))
            if (effectiveLabelType == 5 && row.rowIndex > 0 && row.rowIndex % transparentThrottleEveryRows == 0) {
                // Transparent labels need extra pacing; otherwise motor/feed outruns head heating.
                delay(transparentThrottlePauseMs)
            }
        }

        // Give firmware time to flush last raster chunks before pageEnd.
        val flushDelayMs = if (effectiveLabelType == 5) 700L else 320L
        delay(flushDelayMs)

        session.sendAndReceive(
            packet = encoder.pageEnd(),
            expectedResponseIds = setOf(B1ProtocolConstants.respPageEnd),
        )
        // Allow firmware to commit page-end transition before printEnd.
        delay(120L)

        val printEndFrame = session.sendAndReceive(
            packet = encoder.printEnd(),
            expectedResponseIds = setOf(B1ProtocolConstants.respPrintEnd),
        )
        if (printEndFrame.payload.firstOrNull()?.toInt() != 1) {
            throw PrinterException.PrintTaskFailed("Printer did not acknowledge printEnd.")
        }
        // An acknowledgement means the printer accepted the command, not that
        // it completed the physical print. B1 can report media errors only
        // after the motor starts, so wait for its terminal status before
        // reporting success to Flutter.
        statusMonitor.waitUntilDone(totalPages = 1)
        logger.debug(
            "PRINT",
            "raster send stats bitmapRows=$bitmapRowsSent emptyRowsAs84=$emptyRowsSentAs84 emptyRowsAs85=$emptyRowsSentAs85",
        )
        logger.debug("PRINT", "completed")
        return OperationResult.success(
            message = "Print completed.",
            details = mapOf(
                "rowsSent" to task.rasterRows.size,
                "width" to task.cols,
                "height" to task.rows,
                "selectedLabelType" to selectedProfile.first,
                "selectedDensity" to selectedProfile.second,
                "effectiveLabelType" to effectiveLabelType,
                "rasterDebug" to task.debugReport?.toMap(),
            ),
        )
    }

    private suspend fun ensureReadyForPrint() {
        val before = runCatching { statusMonitor.currentStatus() }
            .onFailure { logger.warn("PRINT", "status before start unavailable: ${it.message}") }
            .getOrNull() ?: return

        logger.debug(
            "PRINT",
            "status before start page=${before.page} printProgress=${before.pagePrintProgress} feedProgress=${before.pageFeedProgress} errorCode=0x${"%02X".format(before.errorCode)}",
        )
        if (before.errorCode == 0) return

        logger.warn(
            "PRINT",
            "status before start is non-zero (0x${"%02X".format(before.errorCode)}), trying soft recovery and continuing with B1 print task flow",
        )
        recoverFromPreflightError()
        delay(PrinterTimeouts.recoveryPauseMs)
        val after = runCatching { statusMonitor.currentStatus() }.getOrNull()
        if (after != null) {
            logger.debug(
                "PRINT",
                "status after preflight recovery page=${after.page} printProgress=${after.pagePrintProgress} feedProgress=${after.pageFeedProgress} errorCode=0x${"%02X".format(after.errorCode)}",
            )
        }
    }

    private suspend fun recoverFromPreflightError() {
        runCatching {
            session.sendAndReceive(
                packet = encoder.cancelPrint(),
                expectedResponseIds = setOf(B1ProtocolConstants.respCancelPrint),
            )
            logger.debug("PRINT", "preflight recovery: cancelPrint acknowledged")
        }.onFailure {
            logger.warn("PRINT", "cancelPrint preflight failed: ${it.message}")
        }

        runCatching {
            session.sendAndReceive(
                packet = encoder.printEnd(),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrintEnd),
            )
            logger.debug("PRINT", "preflight recovery: printEnd acknowledged")
        }.onFailure {
            logger.warn("PRINT", "printEnd preflight failed: ${it.message}")
        }

        runCatching {
            session.sendAndReceive(
                packet = encoder.printClear(),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrintClear),
            )
            logger.debug("PRINT", "preflight recovery: printClear acknowledged")
        }.onFailure {
            logger.warn("PRINT", "printClear preflight failed: ${it.message}")
        }
    }

    private suspend fun startWithMediaProfile(task: PrintTask): Pair<Int, Int> {
        cachedMediaProfile?.let { (cachedLabelType, cachedDensity) ->
            val cacheHit = try {
                tryApplyMediaProfile(cachedLabelType, cachedDensity, withClear = false)
            } catch (error: PrinterException.PrintTaskFailed) {
                logger.warn(
                    "PRINT",
                    "cached media profile threw, falling back to probe path labelType=$cachedLabelType density=$cachedDensity: ${error.message}",
                )
                false
            } catch (error: PrinterException.ProtocolError) {
                logger.warn(
                    "PRINT",
                    "cached media profile threw, falling back to probe path labelType=$cachedLabelType density=$cachedDensity: ${error.message}",
                )
                false
            }
            if (cacheHit) {
                logger.debug(
                    "PRINT",
                    "media profile cache hit labelType=$cachedLabelType density=$cachedDensity",
                )
                return cachedLabelType to cachedDensity
            }
            logger.warn(
                "PRINT",
                "cached media profile rejected, falling back to probe path labelType=$cachedLabelType density=$cachedDensity",
            )
            cachedMediaProfile = null
        }

        runCatching {
            session.sendAndReceive(
                packet = encoder.antiFake(),
                expectedResponseIds = setOf(B1ProtocolConstants.respAntiFake),
            )
            logger.debug("PRINT", "pre-start antiFake acknowledged")
        }.onFailure {
            logger.warn("PRINT", "pre-start antiFake failed: ${it.message}")
        }

        val requestedLabelType = task.labelType.coerceIn(0, 255)
        val requestedDensity = task.density.coerceIn(1, 5)
        val detectedLabelTypes = probeConsumableLabelTypes().mapNotNull { it.labelType }
        val labelTypeCandidates = buildLabelTypeCandidates(
            requestedLabelType = requestedLabelType,
            detectedLabelTypes = detectedLabelTypes,
        )

        val candidates = linkedSetOf<Pair<Int, Int>>()
        for (labelType in labelTypeCandidates) {
            val requestedDensityForLabelType = requestedDensity
            val densityCandidates = densityCandidatesForLabelType(
                requestedDensity = requestedDensityForLabelType,
                labelType = labelType,
            )
            for (density in densityCandidates) {
                candidates.add(labelType to density)
            }
        }

        var lastError: PrinterException? = null
        val clearModes = clearModesForLabelTypeCandidates(labelTypeCandidates)
        for ((labelType, density) in candidates) {
            for (withClear in clearModes) {
                try {
                    if (!tryApplyMediaProfile(labelType, density, withClear)) {
                        continue
                    }
                    cachedMediaProfile = labelType to density
                    return labelType to density
                } catch (error: PrinterException.PrintTaskFailed) {
                    lastError = error
                    val code = (error.errorDetails["printErrorCode"] as? Int) ?: -1
                    logger.warn(
                        "PRINT",
                        "media profile rejected labelType=$labelType density=$density withClear=$withClear code=0x${"%02X".format(code)}",
                    )
                } catch (error: PrinterException.ProtocolError) {
                    // Firmware often ignores an incompatible label type/density
                    // combination instead of replying with an explicit reject,
                    // which surfaces here as a plain read timeout rather than
                    // an 0x00 response. Treat it the same as a rejected
                    // candidate and keep probing instead of aborting the whole
                    // search on the first timeout.
                    lastError = error
                    if (isUnsupportedCommandResponse(error)) {
                        logger.warn(
                            "PRINT",
                            "media profile unsupported by firmware labelType=$labelType density=$density withClear=$withClear",
                        )
                    } else {
                        logger.warn(
                            "PRINT",
                            "media profile probe timed out labelType=$labelType density=$density withClear=$withClear: ${error.message}",
                        )
                    }
                }
            }
        }

        throw lastError ?: PrinterException.PrintTaskFailed("No compatible media profile found.")
    }

    private suspend fun probeConsumableLabelTypes(): List<RfidProbe> {
        val probes = mutableListOf<RfidProbe>()

        fun parseLabelType(payload: ByteArray): Int? {
            // NiimBlueLib dto parser: 8 bytes UUID, VString barcode, VString serial, u16 allPaper, u16 usedPaper, u8 consumablesType
            if (payload.isEmpty() || payload.size == 1) return null
            var offset = 0
            fun ensure(need: Int): Boolean = offset + need <= payload.size
            fun skip(n: Int): Boolean {
                if (!ensure(n)) return false
                offset += n
                return true
            }
            fun readLenString(): Boolean {
                if (!ensure(1)) return false
                val len = payload[offset].toInt() and 0xFF
                offset += 1
                return skip(len)
            }

            if (!skip(8)) return null
            if (!readLenString()) return null
            if (!readLenString()) return null
            if (!skip(2)) return null
            if (!skip(2)) return null
            if (!ensure(1)) return null
            return payload[offset].toInt() and 0xFF
        }

        suspend fun readProbe(
            source: String,
            packet: ByteArray,
            expected: Set<Int>,
        ) {
            runCatching {
                val frame = session.sendAndReceive(packet = packet, expectedResponseIds = expected)
                val type = parseLabelType(frame.payload)
                val probe = RfidProbe(source = source, labelType = type, payloadHex = frame.payload.toHex())
                probes.add(probe)
                logger.debug("PRINT", "rfid probe $source labelType=${type ?: -1} payload=${probe.payloadHex}")
            }.onFailure {
                logger.warn("PRINT", "rfid probe $source failed: ${it.message}")
            }
        }

        readProbe("rfidInfo", encoder.rfidInfo(), setOf(B1ProtocolConstants.respRfidInfo))
        return probes
    }

    private suspend fun tryApplyMediaProfile(
        labelType: Int,
        density: Int,
        withClear: Boolean,
    ): Boolean {
        session.sendAndReceive(
            packet = encoder.setDensity(density.coerceIn(1, 5)),
            expectedResponseIds = setOf(B1ProtocolConstants.respSetDensity),
        )
        session.sendAndReceive(
            packet = encoder.setLabelType(labelType),
            expectedResponseIds = setOf(B1ProtocolConstants.respSetLabelType),
        )
        if (withClear) {
            session.sendAndReceive(
                packet = encoder.printClear(),
                expectedResponseIds = setOf(B1ProtocolConstants.respPrintClear),
            )
        }
        startPrintWithCompatibility(labelType = labelType)
        return true
    }

    private fun isUnsupportedCommandResponse(error: PrinterException.ProtocolError): Boolean {
        val payload = error.errorDetails["payload"] as? String ?: return false
        return payload.startsWith("555500")
    }

    private suspend fun startPrintWithCompatibility(labelType: Int) {
        val transparentMode = labelType == 5

        suspend fun tryStart(
            variant: String,
            packet: ByteArray,
        ): Boolean {
            return try {
                session.sendAndReceive(
                    packet = packet,
                    expectedResponseIds = setOf(B1ProtocolConstants.respPrintStart),
                )
                logger.debug("PRINT", "printStart variant=$variant")
                true
            } catch (error: PrinterException.PrintTaskFailed) {
                val code = (error.errorDetails["printErrorCode"] as? Int) ?: -1
                logger.warn("PRINT", "printStart$variant rejected code=0x${"%02X".format(code)}")
                false
            }
        }

        // B1 reference implementations prefer 7b start packet.
        if (transparentMode) {
            // Keep color=0 as primary for B1 compatibility. Some transparent
            // consumables produce vertical artifacts with color=1.
            if (tryStart("7b(color=0)", encoder.printStart7b(totalPages = 1, pageColor = 0))) return
            if (tryStart("2b", encoder.printStart2b(totalPages = 1))) return
            if (tryStart("1b", encoder.printStart1b())) return
            // Keep color=1 as fallback for firmware/media variants where only
            // transparent-color start is accepted.
            if (tryStart("7b(color=1)", encoder.printStart7b(totalPages = 1, pageColor = 1))) return
        } else {
            if (tryStart("7b(color=0)", encoder.printStart7b(totalPages = 1, pageColor = 0))) return
            if (tryStart("2b", encoder.printStart2b(totalPages = 1))) return
            if (tryStart("1b", encoder.printStart1b())) return
        }

        throw PrinterException.PrintTaskFailed("All printStart variants were rejected.")
    }

    companion object {
        // B1 transparent media can silently drop late raster packets when pushed too fast.
        // Balanced preset: faster than diagnostic mode, still stable on most B1 units.
        internal const val transparentInterPacketDelayMs: Long = 18L
        internal const val transparentThrottleEveryRows: Int = 24
        internal const val transparentThrottlePauseMs: Long = 40L

        internal fun densityCandidatesForLabelType(
            requestedDensity: Int,
            labelType: Int,
        ): LinkedHashSet<Int> {
            val density = requestedDensity.coerceIn(1, 5)
            return if (labelType == 5) {
                linkedSetOf(
                    density,
                    3,
                    4,
                    5,
                    2,
                    1,
                )
            } else {
                linkedSetOf(
                    density,
                    2,
                    3,
                    4,
                    5,
                    1,
                )
            }
        }

        internal fun packetDelayMsForLabelType(labelType: Int): Long {
            return if (labelType == 5) transparentInterPacketDelayMs else PrinterTimeouts.interPacketDelayMs
        }

        internal fun useSplitCountForLabelType(labelType: Int): Boolean {
            return labelType == 5
        }

        internal fun useZeroCountHeaderForLabelType(labelType: Int): Boolean {
            // Transparent consumables on B1 can produce banding when black-pixel
            // counters are populated. Zeroed counters are accepted by firmware
            // and provide more stable output.
            return labelType == 5
        }

        internal fun bitmapRowHeaderLayoutForLabelType(labelType: Int): CommandEncoder.BitmapRowHeaderLayout {
            return CommandEncoder.BitmapRowHeaderLayout.COUNTS_THEN_REPEAT
        }

        internal fun invertBitmapBitsForLabelType(labelType: Int): Boolean {
            return false
        }

        internal fun clearModesForLabelTypeCandidates(labelTypeCandidates: Collection<Int>): List<Boolean> {
            // Transparent labels (type 5) are sensitive to pre-start printClear ordering.
            // Prefer starting without clear first, keep clear as fallback.
            return if (labelTypeCandidates.contains(5)) {
                listOf(false, true)
            } else {
                listOf(true, false)
            }
        }

        internal fun effectiveRasterLabelType(
            taskLabelType: Int,
            selectedLabelType: Int,
        ): Int {
            val fromProfile = selectedLabelType.coerceIn(0, 255)
            if (fromProfile > 0) return fromProfile
            val fromTask = taskLabelType.coerceIn(0, 255)
            if (fromTask > 0) return fromTask
            return 1
        }

        internal fun buildLabelTypeCandidates(
            requestedLabelType: Int,
            detectedLabelTypes: List<Int>,
        ): LinkedHashSet<Int> {
            val candidates = linkedSetOf<Int>()
            // Respect explicit UI selection first. `0` means "auto by RFID".
            if (requestedLabelType > 0) {
                candidates.add(requestedLabelType)
            }
            candidates.addAll(detectedLabelTypes)
            // NiimBlueLib LabelType enum values fallback list.
            candidates.addAll(listOf(1, 2, 3, 4, 5, 6, 10, 11))
            return candidates
        }
    }
}
