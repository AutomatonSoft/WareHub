#ifndef FLUTTER_PLUGIN_NIIMBOT_LABEL_PRINTER_PLUGIN_H_
#define FLUTTER_PLUGIN_NIIMBOT_LABEL_PRINTER_PLUGIN_H_

#include <flutter/method_channel.h>
#include <flutter/plugin_registrar_windows.h>

#include <memory>

namespace niimbot_label_printer {

class NiimbotLabelPrinterPlugin : public flutter::Plugin {
 public:
  static void RegisterWithRegistrar(flutter::PluginRegistrarWindows *registrar);

  NiimbotLabelPrinterPlugin();

  virtual ~NiimbotLabelPrinterPlugin();

  // Disallow copy and assign.
  NiimbotLabelPrinterPlugin(const NiimbotLabelPrinterPlugin&) = delete;
  NiimbotLabelPrinterPlugin& operator=(const NiimbotLabelPrinterPlugin&) = delete;

  // Called when a method is called on this plugin's channel from Dart.
  void HandleMethodCall(
      const flutter::MethodCall<flutter::EncodableValue> &method_call,
      std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result);
};

}  // namespace niimbot_label_printer

#endif  // FLUTTER_PLUGIN_NIIMBOT_LABEL_PRINTER_PLUGIN_H_
