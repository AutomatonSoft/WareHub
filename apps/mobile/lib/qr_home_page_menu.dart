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

  Future<void> _openLanguageDialog() async {
    final AppSettings settings = AppSettingsScope.of(context);
    final AppLang current = settings.language;
    final AppStrings strings = _strings;

    final AppLang? picked = await showDialog<AppLang>(
      context: context,
      builder: (BuildContext dialogContext) {
        AppLang selected = current;
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setStateDialog) {
            return AlertDialog(
              title: Text(strings.text('language')),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: AppLang.values
                    .map(
                      (AppLang lang) => ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(lang.label),
                        trailing: selected == lang
                            ? const Icon(Icons.check, color: uiGreen)
                            : null,
                        onTap: () {
                          setStateDialog(() {
                            selected = lang;
                          });
                        },
                      ),
                    )
                    .toList(),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(strings.text('save')),
                ),
              ],
            );
          },
        );
      },
    );

    if (picked != null) {
      await settings.setLanguage(picked);
    }
  }

  Future<void> _handleTopMenuAction(String value) async {
    final AppSettings settings = AppSettingsScope.of(context);
    switch (value) {
      case 'remove':
        if (!(_adding ||
            _removing ||
            _printingItemId != null ||
            _printingImage)) {
          await _onRemoveItem();
        }
        break;
      case 'printer_setup':
        if (!settings.isAdmin) {
          break;
        }
        if (!(_adding ||
            _removing ||
            _printingItemId != null ||
            _printingImage)) {
          await _openPrintSettingsDialog();
        }
        break;
      case 'label_layout':
        if (!settings.isAdmin) {
          break;
        }
        if (!(_adding ||
            _removing ||
            _printingItemId != null ||
            _printingImage)) {
          await _openLabelLayoutEditorDialog();
        }
        break;
      case 'print_image':
        if (!settings.isAdmin) {
          break;
        }
        if (!(_adding ||
            _removing ||
            _printingItemId != null ||
            _printingImage)) {
          await _onPickAndPrintImage();
        }
        break;
      case 'reload':
        await _reloadList();
        break;
      default:
        break;
    }
  }

  Future<void> _handleAppBarMenuAction(String value) async {
    switch (value) {
      case 'account':
        await _onLogoutTap();
        break;
      case 'language':
        await _openLanguageDialog();
        break;
      case 'check_updates':
        if (!_checkingUpdates) {
          await _checkForUpdates(silentIfLatest: false);
        }
        break;
      case 'update_app':
        await _onUpdateTap();
        break;
      case 'connect_printer':
        if (!_connectingPrinter) {
          await _onConnectPrinterTap();
        }
        break;
      default:
        await _handleTopMenuAction(value);
        break;
    }
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
            return AlertDialog(
              title: Text(strings.text('printer_setup')),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    TextFormField(
                      initialValue: widthText,
                      keyboardType: TextInputType.number,
                      onChanged: (String value) {
                        widthText = value;
                      },
                      decoration: InputDecoration(
                        labelText: strings.text('label_width'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      initialValue: heightText,
                      keyboardType: TextInputType.number,
                      onChanged: (String value) {
                        heightText = value;
                      },
                      decoration: InputDecoration(
                        labelText: strings.text('label_height'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      initialValue: interLabelDelayMsText,
                      keyboardType: TextInputType.number,
                      onChanged: (String value) {
                        interLabelDelayMsText = value;
                      },
                      decoration: const InputDecoration(
                        labelText: 'Print delay between labels (ms)',
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<int>(
                      initialValue: nextLabelType,
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
                      decoration: InputDecoration(
                        labelText: strings.text('label_type'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<int>(
                      initialValue: nextDensity,
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
                      decoration: InputDecoration(
                        labelText: strings.text('density'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(strings.text('preview_only_mode')),
                      subtitle: Text(strings.text('preview_only_help')),
                      value: nextPreviewOnly,
                      onChanged: (bool value) {
                        setStateDialog(() {
                          nextPreviewOnly = value;
                        });
                      },
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        strings.text('printer_hint'),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(strings.text('cancel')),
                ),
                FilledButton(
                  onPressed: () async {
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
                  },
                  child: Text(strings.text('save')),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
