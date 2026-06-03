#include "include/niimbot_label_printer/niimbot_label_printer_plugin_c_api.h"

#include <flutter/plugin_registrar_windows.h>

#include "niimbot_label_printer_plugin.h"

void NiimbotLabelPrinterPluginCApiRegisterWithRegistrar(
    FlutterDesktopPluginRegistrarRef registrar) {
  niimbot_label_printer::NiimbotLabelPrinterPlugin::RegisterWithRegistrar(
      flutter::PluginRegistrarManager::GetInstance()
          ->GetRegistrar<flutter::PluginRegistrarWindows>(registrar));
}
