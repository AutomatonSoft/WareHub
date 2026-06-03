package com.example.niimbot_label_printer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal class AndroidPrinterPlugin(context: Context) {
    private val logger = DiagnosticsLogger()
    private val connectionManager = PrinterConnectionManager(context, logger)
    private val encoder = CommandEncoder()
    private val decoder = ResponseDecoder()
    private val session = PrinterSession(logger, decoder)
    private val statusMonitor = StatusMonitor(session, encoder, decoder, logger)
    private val protocolAdapter = B1ProtocolAdapter(session, encoder, decoder, statusMonitor, logger)
    private val taskBuilder = PrintTaskBuilder(
        rasterizer = ImageRasterizer(debugStore = null, logger = logger),
        logger = logger,
    )
    private val errorMapper = ErrorMapper()
    private val opMutex = Mutex()

    @Volatile
    private var initializedInfo: PrinterInfo? = null

    suspend fun connect(address: String, pairFirst: Boolean): OperationResult = runCatching {
        opMutex.withLock {
            val socket = connectionManager.connect(address, pairFirst)
            session.attach(socket)
            initializedInfo = protocolAdapter.initialize()
            OperationResult.success(
                message = "Connected.",
                details = mapOf(
                    "address" to address,
                    "model" to initializedInfo?.modelName,
                    "modelId" to initializedInfo?.modelId,
                ),
            )
        }
    }.getOrElse(errorMapper::toOperationResult)

    suspend fun disconnect(): OperationResult = runCatching {
        opMutex.withLock {
            connectionManager.disconnect()
            initializedInfo = null
            OperationResult.success("Disconnected.")
        }
    }.getOrElse(errorMapper::toOperationResult)

    fun hasBluetoothPermission(): Boolean = connectionManager.hasBluetoothPermission()

    fun isBluetoothEnabled(): Boolean = connectionManager.isBluetoothEnabled()

    fun isConnected(): Boolean = connectionManager.isConnected()

    fun getPairedDevices(): List<String> = connectionManager.getPairedDevices()

    fun getAvailableDevices(scanMillis: Int): List<String> = connectionManager.getAvailableDevices(scanMillis)

    suspend fun getPrinterInfo(): OperationResult = runCatching {
        opMutex.withLock {
            val info = initializedInfo ?: throw PrinterException.ConnectionFailed("Printer session is not initialized.")
            OperationResult.success(
                details = mapOf(
                    "modelId" to info.modelId,
                    "modelName" to info.modelName,
                    "serialNumber" to info.serialNumber,
                    "bluetoothMac" to info.bluetoothMac,
                )
            )
        }
    }.getOrElse(errorMapper::toOperationResult)

    suspend fun getPrinterStatus(): OperationResult = runCatching {
        opMutex.withLock {
            val status = protocolAdapter.getStatus()
            OperationResult.success(
                details = mapOf(
                    "page" to status.page,
                    "pagePrintProgress" to status.pagePrintProgress,
                    "pageFeedProgress" to status.pageFeedProgress,
                    "errorCode" to status.errorCode,
                    "raw" to status.raw.toHex(),
                )
            )
        }
    }.getOrElse(errorMapper::toOperationResult)

    suspend fun print(payload: Map<*, *>): OperationResult = runCatching {
        opMutex.withLock {
            if (!connectionManager.isConnected()) {
                throw PrinterException.ConnectionFailed("Printer is disconnected.")
            }
            val task = taskBuilder.build(payload)
            protocolAdapter.print(task)
        }
    }.getOrElse(errorMapper::toOperationResult)

    suspend fun debugPrintTestPattern(
        labelType: Int = 5,
        density: Int = 3,
        bitOrder: String = "MSB",
        invertPackedBits: Boolean = false,
    ): OperationResult = runCatching {
        opMutex.withLock {
            if (!connectionManager.isConnected()) {
                throw PrinterException.ConnectionFailed("Printer is disconnected.")
            }
            val payload = buildDebugPatternPayload(
                width = B1ProtocolConstants.b1PrintheadPixels,
                height = 240,
                labelType = labelType.coerceIn(0, 5),
                density = density.coerceIn(1, 5),
                bitOrder = bitOrder,
                invertPackedBits = invertPackedBits,
            )
            logger.debug(
                "PRINT",
                "debugPrintTestPattern payload prepared labelType=$labelType density=$density bitOrder=$bitOrder invertPackedBits=$invertPackedBits",
            )
            val task = taskBuilder.build(payload)
            protocolAdapter.print(task)
        }
    }.getOrElse(errorMapper::toOperationResult)

    private fun buildDebugPatternPayload(
        width: Int,
        height: Int,
        labelType: Int,
        density: Int,
        bitOrder: String,
        invertPackedBits: Boolean,
    ): Map<String, Any> {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val fillPaint = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.FILL
            isAntiAlias = false
        }
        val strokePaint = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 4f
            isAntiAlias = false
        }

        canvas.drawRect(RectF(2f, 2f, (width - 2).toFloat(), (height - 2).toFloat()), strokePaint)
        canvas.drawRect(0f, 0f, width.toFloat(), 18f, fillPaint)

        val checkerTop = 24
        val checkerBottom = 88
        for (y in checkerTop until checkerBottom step 8) {
            for (x in 0 until width step 8) {
                if (((x / 8) + (y / 8)) % 2 == 0) {
                    canvas.drawRect(x.toFloat(), y.toFloat(), (x + 8).toFloat(), (y + 8).toFloat(), fillPaint)
                }
            }
        }

        val verticalTop = 94
        val verticalBottom = 126
        for (x in 0 until width step 16) {
            canvas.drawRect(x.toFloat(), verticalTop.toFloat(), (x + 8).toFloat(), verticalBottom.toFloat(), fillPaint)
        }

        val horizontalTop = 132
        val horizontalBottom = 164
        for (y in horizontalTop until horizontalBottom step 8) {
            canvas.drawRect(0f, y.toFloat(), width.toFloat(), (y + 4).toFloat(), fillPaint)
        }

        canvas.drawLine(0f, 170f, width.toFloat(), 222f, strokePaint)

        val textPaint = Paint().apply {
            color = Color.BLACK
            textSize = 36f
            isAntiAlias = false
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("TEST", width / 2f, 212f, textPaint)
        canvas.drawRect(0f, (height - 18).toFloat(), width.toFloat(), height.toFloat(), fillPaint)

        val pngBytes = ByteArrayOutputStream().use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            stream.toByteArray()
        }

        return mapOf(
            "bytes" to pngBytes.toList(),
            "width" to width,
            "height" to height,
            "rotate" to false,
            "invertColor" to false,
            "density" to density,
            "labelType" to labelType,
            "bitOrder" to bitOrder,
            "invertPackedBits" to invertPackedBits,
        )
    }
}
