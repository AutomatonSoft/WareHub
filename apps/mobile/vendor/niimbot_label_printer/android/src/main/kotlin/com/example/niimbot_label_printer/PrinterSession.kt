package com.example.niimbot_label_printer

import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream

internal class PrinterSession(
    private val logger: DiagnosticsLogger,
    private val decoder: ResponseDecoder,
) {
    private var socket: BluetoothSocket? = null

    fun attach(connectedSocket: BluetoothSocket) {
        socket = connectedSocket
    }

    fun isConnected(): Boolean = socket?.isConnected == true

    suspend fun sendAndReceive(
        packet: ByteArray,
        expectedResponseIds: Set<Int>,
        timeoutMs: Long = PrinterTimeouts.commandTimeoutMs,
    ): NiimbotFrame = withContext(Dispatchers.IO) {
        val activeSocket = socket ?: throw PrinterException.ConnectionFailed("Socket is not attached.")
        if (!activeSocket.isConnected) throw PrinterException.DisconnectedDuringPrint()

        try {
            activeSocket.outputStream.write(packet)
            activeSocket.outputStream.flush()
            logger.debug("TX", packet.toHex())
        } catch (_: Exception) {
            throw PrinterException.DisconnectedDuringPrint()
        }

        val started = System.currentTimeMillis()
        while (System.currentTimeMillis() - started < timeoutMs) {
            val raw = readFrame(activeSocket.inputStream, timeoutMs)
            logger.debug("RX", raw.toHex())
            val frame = decoder.decodeFrame(raw)
            SessionResponsePolicy.throwIfFailure(frame, expectedResponseIds, raw.toHex())
            if (frame.command in expectedResponseIds) {
                return@withContext frame
            }
        }

        throw PrinterException.ProtocolError("Timed out waiting expected response.", mapOf("expected" to expectedResponseIds.toList()))
    }

    suspend fun sendOneWay(packet: ByteArray): Unit = withContext(Dispatchers.IO) {
        val activeSocket = socket ?: throw PrinterException.ConnectionFailed("Socket is not attached.")
        if (!activeSocket.isConnected) throw PrinterException.DisconnectedDuringPrint()
        try {
            activeSocket.outputStream.write(packet)
            activeSocket.outputStream.flush()
            logger.debug("TX", packet.toHex())
        } catch (_: Exception) {
            throw PrinterException.DisconnectedDuringPrint()
        }
    }

    suspend fun initializeHandshake(encoder: CommandEncoder): Unit {
        val response = sendAndReceive(
            packet = encoder.connect(),
            expectedResponseIds = setOf(B1ProtocolConstants.respConnect),
            timeoutMs = PrinterTimeouts.connectTimeoutMs,
        )
        val status = response.payload.firstOrNull()?.toInt() ?: -1
        if (status !in setOf(1, 2, 3)) {
            throw PrinterException.HandshakeFailed("Unexpected connect status: $status")
        }
        logger.debug("SESSION", "Handshake status=$status")
    }

    private fun readFrame(input: InputStream, timeoutMs: Long): ByteArray {
        val deadline = System.currentTimeMillis() + timeoutMs

        fun readByte(): Int {
            while (input.available() <= 0) {
                if (System.currentTimeMillis() >= deadline) {
                    throw PrinterException.ProtocolError("Read timeout waiting for frame.")
                }
                Thread.sleep(6)
            }
            val value = input.read()
            if (value < 0) throw PrinterException.DisconnectedDuringPrint()
            return value
        }

        var prev = -1
        while (true) {
            val current = readByte()
            if (prev == B1ProtocolConstants.packetHead && current == B1ProtocolConstants.packetHead) {
                break
            }
            prev = current
        }

        val command = readByte()
        val len = readByte()
        val payload = ByteArray(len)
        var offset = 0
        while (offset < len) {
            val read = input.read(payload, offset, len - offset)
            if (read <= 0) throw PrinterException.DisconnectedDuringPrint()
            offset += read
        }

        val checksum = readByte()
        val tailA = readByte()
        val tailB = readByte()

        val out = ByteArray(2 + 1 + 1 + len + 1 + 2)
        out[0] = B1ProtocolConstants.packetHead.toByte()
        out[1] = B1ProtocolConstants.packetHead.toByte()
        out[2] = command.toByte()
        out[3] = len.toByte()
        if (len > 0) {
            payload.copyInto(out, destinationOffset = 4)
        }
        out[4 + len] = checksum.toByte()
        out[5 + len] = tailA.toByte()
        out[6 + len] = tailB.toByte()
        return out
    }
}

internal fun ByteArray.toHex(): String = joinToString(separator = "") { "%02x".format(it.toInt() and 0xFF) }

internal object SessionResponsePolicy {
    fun throwIfFailure(frame: NiimbotFrame, expectedResponseIds: Set<Int>, rawHex: String) {
        if (frame.command == B1ProtocolConstants.respPrintError) {
            val code = frame.payload.firstOrNull()?.toInt()?.and(0xFF) ?: -1
            val hint = when (code) {
                0x14 -> "Printer rejected media profile or consumable authentication failed."
                else -> "Unknown print error."
            }
            throw PrinterException.PrintTaskFailed(
                message = "Printer returned print error 0x${"%02X".format(code)}. $hint",
                details = mapOf("printErrorCode" to code, "hint" to hint, "payload" to rawHex),
            )
        }

        // Some B1 firmware returns command 0x00 as "unsupported command/arg".
        // Fail fast instead of waiting for timeout when expected response cannot arrive.
        if (frame.command == 0x00) {
            throw PrinterException.ProtocolError(
                message = "Printer returned unsupported response command 0x00.",
                details = mapOf("expected" to expectedResponseIds.toList(), "payload" to rawHex),
            )
        }
    }
}
