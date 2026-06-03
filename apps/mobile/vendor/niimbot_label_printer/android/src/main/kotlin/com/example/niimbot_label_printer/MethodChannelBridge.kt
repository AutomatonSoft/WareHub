package com.example.niimbot_label_printer

import android.os.Build
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

internal class MethodChannelBridge(
    private val scope: CoroutineScope,
    private val api: AndroidPrinterPlugin,
) {
    fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getPlatformVersion" -> result.success("Android ${Build.VERSION.RELEASE}")
            "ispermissionbluetoothgranted" -> result.success(api.hasBluetoothPermission())
            "isBluetoothEnabled" -> result.success(api.isBluetoothEnabled())
            "isConnected", "isPrinterConnected" -> result.success(api.isConnected())
            "getPairedDevices" -> result.success(api.getPairedDevices())
            "getAvailableDevices" -> {
                val args = call.arguments as? Map<*, *>
                val scanMillis = ((args?.get("scanMillis") as? Int) ?: 6000).coerceIn(1000, 15000)
                result.success(api.getAvailableDevices(scanMillis))
            }
            "connect", "connectPrinter" -> {
                val address = call.arguments?.toString()?.trim().orEmpty()
                launchResult(result) { api.connect(address, pairFirst = false) }
            }
            "connectDetailed" -> {
                val args = call.arguments as? Map<*, *>
                val address = args?.get("address")?.toString()?.trim().orEmpty()
                launchResult(result) { api.connect(address, pairFirst = false) }
            }
            "pairAndConnect", "pairAndConnectPrinter" -> {
                val address = call.arguments?.toString()?.trim().orEmpty()
                launchResult(result) { api.connect(address, pairFirst = true) }
            }
            "pairAndConnectDetailed" -> {
                val args = call.arguments as? Map<*, *>
                val address = args?.get("address")?.toString()?.trim().orEmpty()
                launchResult(result) { api.connect(address, pairFirst = true) }
            }
            "disconnect", "disconnectPrinter" -> launchResult(result) { api.disconnect() }
            "getPrinterInfo" -> launchResult(result) { api.getPrinterInfo() }
            "getPrinterStatus" -> launchResult(result) { api.getPrinterStatus() }
            "send" -> {
                val payload = call.arguments as? Map<*, *> ?: emptyMap<String, Any?>()
                launchResult(result, raw = false) { api.print(payload) }
            }
            "sendDetailed", "printImage", "printLabel" -> {
                val payload = call.arguments as? Map<*, *> ?: emptyMap<String, Any?>()
                launchResult(result, raw = true) { api.print(payload) }
            }
            "debugPrintTestPattern" -> {
                val args = call.arguments as? Map<*, *>
                val labelType = (args?.get("labelType") as? Number)?.toInt() ?: 5
                val density = (args?.get("density") as? Number)?.toInt() ?: 3
                val bitOrder = args?.get("bitOrder")?.toString() ?: "MSB"
                val invertPackedBits = (args?.get("invertPackedBits") as? Boolean) ?: false
                launchResult(result, raw = true) {
                    api.debugPrintTestPattern(
                        labelType = labelType,
                        density = density,
                        bitOrder = bitOrder,
                        invertPackedBits = invertPackedBits,
                    )
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun launchResult(
        result: MethodChannel.Result,
        raw: Boolean = true,
        block: suspend () -> OperationResult,
    ) {
        scope.launch(Dispatchers.IO) {
            val op = block()
            if (raw) {
                result.success(op.toMap())
            } else {
                result.success(op.ok)
            }
        }
    }
}
