// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

extension _QrHomePageMenu on _QrHomePageState {
  Future<void> _savePrinterSetupSettings() async {
    await _savePrinterSetupSettingsLocal();
    await _pushPrinterSetupToServer();
  }

  Future<void> _savePrinterSetupSettingsLocal() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setInt('print_width_px', _printWidthPx);
    await prefs.setInt('print_height_px', _printHeightPx);
    await prefs.setInt('print_density', _printDensity);
    await prefs.setInt('print_label_type', _printLabelType);
    await prefs.setInt('print_inter_label_delay_ms', _printInterLabelDelayMs);
    await prefs.setBool('print_preview_only', _previewOnlyMode);
  }

  Future<void> _syncPrinterSetupFromServer() async {
    try {
      final Uri url = Uri.parse('${_effectiveApiBase()}/printer-setup');
      final http.Response response = await _authorizedRequest('GET', url);
      if (response.statusCode == 401) {
        final MobileAuthRefreshStatus status =
            await _handleUnauthorizedAfterRefresh();
        if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
          throw const MobileAuthRefreshUnavailableException();
        }
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return;
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return;
      }
      final int width = _asInt(decoded['print_width_px'], _printWidthPx);
      final int height = _asInt(decoded['print_height_px'], _printHeightPx);
      final int density = _asInt(decoded['print_density'], _printDensity);
      final int labelType =
          _asInt(decoded['print_label_type'], _printLabelType);
      final int delayMs = _asInt(
          decoded['print_inter_label_delay_ms'], _printInterLabelDelayMs);
      final bool previewOnly = decoded['print_preview_only'] is bool
          ? decoded['print_preview_only'] as bool
          : _previewOnlyMode;

      if (!mounted) {
        return;
      }
      setState(() {
        _printWidthPx = (width >= 300 && width <= 600) ? width : 384;
        _printHeightPx = (height >= 500 && height <= 900) ? height : 640;
        _printDensity = density.clamp(1, 5);
        _printLabelType = labelType.clamp(0, 5);
        _printInterLabelDelayMs = delayMs.clamp(0, 2000);
        _previewOnlyMode = previewOnly;
      });
      await _savePrinterSetupSettingsLocal();
    } catch (_) {
      // Keep local settings on network/parse errors.
    }
  }

  Future<void> _pushPrinterSetupToServer() async {
    final Uri url = Uri.parse('${_effectiveApiBase()}/printer-setup');
    final http.Response response = await _authorizedRequest(
      'PUT',
      url,
      headers: _authHeaders(json: true),
      body: jsonEncode(<String, dynamic>{
        'print_width_px': _printWidthPx,
        'print_height_px': _printHeightPx,
        'print_density': _printDensity,
        'print_label_type': _printLabelType,
        'print_inter_label_delay_ms': _printInterLabelDelayMs,
        'print_preview_only': _previewOnlyMode,
      }),
    );
    if (response.statusCode == 401) {
      final MobileAuthRefreshStatus status =
          await _handleUnauthorizedAfterRefresh();
      if (status == MobileAuthRefreshStatus.temporarilyUnavailable) {
        throw const MobileAuthRefreshUnavailableException();
      }
      throw Exception('Unauthorized');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to save global printer setup');
    }
  }

  int _asInt(dynamic value, int fallback) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    return fallback;
  }

  Future<void> _onLogoutTap() async {
    final AppSettings settings = AppSettingsScope.of(context);
    await logoutMobileAuthSession(settings, apiBase: _effectiveApiBase());
    if (!mounted) {
      return;
    }
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
  }

  Future<void> _openPrintSettingsDialog() async {
    String widthText = _printWidthPx.toString();
    String heightText = _printHeightPx.toString();
    String interLabelDelayMsText = _printInterLabelDelayMs.toString();
    int nextDensity = _printDensity;
    int nextLabelType = _printLabelType;
    bool nextPreviewOnly = _previewOnlyMode;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            final AppStrings strings = AppStrings.of(dialogContext);

            Future<void> savePrinterSetup() async {
              final int? w = int.tryParse(widthText.trim());
              final int? h = int.tryParse(heightText.trim());
              final int? interLabelDelayMs =
                  int.tryParse(interLabelDelayMsText.trim());
              if (w == null ||
                  h == null ||
                  w < 300 ||
                  w > 600 ||
                  h < 500 ||
                  h > 900) {
                _showMessage(
                  'Width must be 300..600 and height 500..900.',
                  error: true,
                );
                return;
              }
              if (interLabelDelayMs == null ||
                  interLabelDelayMs < 0 ||
                  interLabelDelayMs > 2000) {
                _showMessage(
                  'Delay must be between 0 and 2000 ms.',
                  error: true,
                );
                return;
              }
              Navigator.of(dialogContext).pop();
              if (!mounted) {
                return;
              }
              setState(() {
                _printWidthPx = w;
                _printHeightPx = h;
                _printDensity = nextDensity;
                _printLabelType = nextLabelType;
                _printInterLabelDelayMs = interLabelDelayMs;
                _previewOnlyMode = nextPreviewOnly;
              });
              try {
                await _savePrinterSetupSettings();
              } catch (_) {
                if (!mounted) {
                  return;
                }
                _showMessage(
                  'Saved locally, but failed to sync global printer setup.',
                  error: true,
                );
                return;
              }
              if (!mounted) {
                return;
              }
              _showMessage(
                strings.format('printer_setup_saved', <String, String>{
                  'width': '$_printWidthPx',
                  'height': '$_printHeightPx',
                  'type': '$_printLabelType',
                  'density': '$_printDensity',
                  'preview': _previewOnlyMode
                      ? strings.text('on')
                      : strings.text('off'),
                }),
              );
            }

            return AlertDialog(
              backgroundColor: AuthColors.background,
              shape: _printerDialogShape(),
              titlePadding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
              title: Text(
                strings.text('printer_setup'),
                style: _printerDialogTitleStyle,
              ),
              contentPadding: const EdgeInsets.fromLTRB(28, 18, 28, 28),
              content: SingleChildScrollView(
                child: SizedBox(
                  width: _printerDialogWidth,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      TextFormField(
                        initialValue: widthText,
                        style: _printerFieldTextStyle,
                        keyboardType: TextInputType.number,
                        onChanged: (String value) {
                          widthText = value;
                        },
                        decoration: _printerInputDecoration(
                            strings.text('label_width')),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        initialValue: heightText,
                        style: _printerFieldTextStyle,
                        keyboardType: TextInputType.number,
                        onChanged: (String value) {
                          heightText = value;
                        },
                        decoration: _printerInputDecoration(
                          strings.text('label_height'),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        initialValue: interLabelDelayMsText,
                        style: _printerFieldTextStyle,
                        keyboardType: TextInputType.number,
                        onChanged: (String value) {
                          interLabelDelayMsText = value;
                        },
                        decoration: _printerInputDecoration(
                          'Print delay between labels (ms)',
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        initialValue: nextLabelType,
                        style: _printerFieldTextStyle,
                        items: <DropdownMenuItem<int>>[
                          const DropdownMenuItem(
                            value: 0,
                            child: Text('Auto (RFID)'),
                          ),
                          DropdownMenuItem(
                            value: 1,
                            child: Text(
                              strings.format(
                                'label_type_value',
                                <String, String>{'value': '1'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 2,
                            child: Text(
                              strings.format(
                                'label_type_value',
                                <String, String>{'value': '2'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 3,
                            child: Text(
                              strings.format(
                                'label_type_value',
                                <String, String>{'value': '3'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 4,
                            child: Text(
                              strings.format(
                                'label_type_value',
                                <String, String>{'value': '4'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 5,
                            child: Text(
                              strings.format(
                                'label_type_value',
                                <String, String>{'value': '5'},
                              ),
                            ),
                          ),
                        ],
                        onChanged: (int? value) {
                          if (value == null) return;
                          setStateDialog(() {
                            nextLabelType = value;
                          });
                        },
                        decoration:
                            _printerInputDecoration(strings.text('label_type')),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        initialValue: nextDensity,
                        style: _printerFieldTextStyle,
                        items: <DropdownMenuItem<int>>[
                          DropdownMenuItem(
                            value: 1,
                            child: Text(
                              strings.format(
                                'density_value',
                                <String, String>{'value': '1'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 2,
                            child: Text(
                              strings.format(
                                'density_value',
                                <String, String>{'value': '2'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 3,
                            child: Text(
                              strings.format(
                                'density_value',
                                <String, String>{'value': '3'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 4,
                            child: Text(
                              strings.format(
                                'density_value',
                                <String, String>{'value': '4'},
                              ),
                            ),
                          ),
                          DropdownMenuItem(
                            value: 5,
                            child: Text(
                              strings.format(
                                'density_value',
                                <String, String>{'value': '5'},
                              ),
                            ),
                          ),
                        ],
                        onChanged: (int? value) {
                          if (value == null) return;
                          setStateDialog(() {
                            nextDensity = value;
                          });
                        },
                        decoration:
                            _printerInputDecoration(strings.text('density')),
                      ),
                      const SizedBox(height: 18),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          strings.text('preview_only_mode'),
                          style: AuthTextStyles.input.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: Text(
                          strings.text('preview_only_help'),
                          style: AuthTextStyles.input.copyWith(
                            fontWeight: FontWeight.w400,
                            height: 1.35,
                          ),
                        ),
                        value: nextPreviewOnly,
                        onChanged: (bool value) {
                          setStateDialog(() {
                            nextPreviewOnly = value;
                          });
                        },
                      ),
                      const SizedBox(height: 18),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          strings.text('printer_hint'),
                          style: AuthTextStyles.input.copyWith(
                            fontWeight: FontWeight.w400,
                            height: 1.35,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      _PrinterPrimaryButton(
                        label: strings.text('save'),
                        onPressed: savePrinterSetup,
                      ),
                      const SizedBox(height: 8),
                      _PrinterSecondaryButton(
                        label: strings.text('cancel'),
                        onPressed: () => Navigator.of(dialogContext).pop(),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
