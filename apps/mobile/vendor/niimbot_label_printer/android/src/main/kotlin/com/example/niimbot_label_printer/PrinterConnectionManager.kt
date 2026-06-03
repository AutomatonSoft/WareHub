package com.example.niimbot_label_printer

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

internal class PrinterConnectionManager(
    private val context: Context,
    private val logger: DiagnosticsLogger,
) {
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var socket: BluetoothSocket? = null

    fun hasBluetoothPermission(): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    fun isBluetoothEnabled(): Boolean {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return false
        return adapter.isEnabled
    }

    fun isConnected(): Boolean = socket?.isConnected == true

    fun getPairedDevices(): List<String> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()
        return adapter.bondedDevices
            ?.map { "${it.name ?: "Unknown device"}#${it.address}" }
            ?.distinctBy { it.substringAfter('#').uppercase() }
            ?: emptyList()
    }

    fun getAvailableDevices(scanMillis: Int): List<String> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()

        val byAddress = LinkedHashMap<String, String>()
        adapter.bondedDevices?.forEach { device ->
            byAddress[device.address.uppercase()] = "${device.name ?: "Unknown device"}#${device.address}"
        }

        val done = CountDownLatch(1)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                when (intent?.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        if (device != null) {
                            byAddress[device.address.uppercase()] = "${device.name ?: "Unknown device"}#${device.address}"
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> done.countDown()
                }
            }
        }

        return try {
            context.registerReceiver(receiver, IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_FOUND)
                addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            })
            if (adapter.isDiscovering) adapter.cancelDiscovery()
            adapter.startDiscovery()
            done.await(scanMillis.toLong(), TimeUnit.MILLISECONDS)
            if (adapter.isDiscovering) adapter.cancelDiscovery()
            byAddress.values.toList()
        } catch (e: Exception) {
            logger.warn("SCAN", "Classic discovery failed: ${e.message}")
            byAddress.values.toList()
        } finally {
            runCatching { context.unregisterReceiver(receiver) }
        }
    }

    fun connect(address: String, pairFirst: Boolean): BluetoothSocket {
        if (!hasBluetoothPermission()) throw PrinterException.PermissionDenied()
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: throw PrinterException.BluetoothUnavailable()
        if (!adapter.isEnabled) throw PrinterException.ConnectionFailed("Bluetooth is disabled.")

        val normalized = normalizeAddress(address)
        val activeSocket = socket
        if (activeSocket?.isConnected == true) {
            val connectedAddress = activeSocket.remoteDevice?.address?.uppercase()
            if (connectedAddress == normalized.uppercase()) {
                logger.debug("CONNECT", "Reusing existing socket for $normalized")
                return activeSocket
            }
        }

        val device = runCatching { adapter.getRemoteDevice(normalized) }.getOrNull()
            ?: throw PrinterException.DeviceNotFound(normalized)

        if (pairFirst) {
            ensureBond(device)
        }

        disconnect()
        if (adapter.isDiscovering) adapter.cancelDiscovery()

        logger.debug("CONNECT", "Connecting to $normalized")
        val newSocket = runCatching { device.createRfcommSocketToServiceRecord(sppUuid) }.getOrNull()
            ?: throw PrinterException.ConnectionFailed("Could not create RFCOMM socket.")

        try {
            newSocket.connect()
            socket = newSocket
            logger.debug("CONNECT", "Socket connected")
            return newSocket
        } catch (e: Exception) {
            runCatching { newSocket.close() }
            throw PrinterException.ConnectionFailed(
                message = "RFCOMM connect failed: ${e.message}",
                details = mapOf("address" to normalized),
            )
        }
    }

    fun currentSocket(): BluetoothSocket? = socket

    fun disconnect() {
        runCatching { socket?.close() }
        socket = null
    }

    private fun ensureBond(device: BluetoothDevice) {
        if (device.bondState == BluetoothDevice.BOND_BONDED) return
        val done = CountDownLatch(1)
        var bonded = false
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
                val changed: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                if (changed?.address != device.address) return
                val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                if (state == BluetoothDevice.BOND_BONDED) {
                    bonded = true
                    done.countDown()
                }
                if (state == BluetoothDevice.BOND_NONE) {
                    bonded = false
                    done.countDown()
                }
            }
        }

        try {
            context.registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED))
            val started = device.createBond()
            if (!started) throw PrinterException.ConnectionFailed("Pairing could not be started.")
            done.await(20, TimeUnit.SECONDS)
        } finally {
            runCatching { context.unregisterReceiver(receiver) }
        }

        if (!bonded) {
            throw PrinterException.ConnectionFailed("Pairing failed.", mapOf("address" to device.address))
        }
    }

    private fun normalizeAddress(address: String): String {
        val text = address.trim().replace('-', ':').uppercase()
        if (text.length == 12 && text.all { it in "0123456789ABCDEF" }) {
            return text.chunked(2).joinToString(":")
        }
        return text
    }
}
