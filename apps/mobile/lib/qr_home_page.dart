import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:niimbot_label_printer/niimbot_label_printer.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'app_settings.dart';
import 'app_theme.dart';
import 'app_update.dart';
import 'intake_error_messages.dart';
import 'intake_photo_folder.dart';
import 'mobile_auth.dart';
import 'mobile_logging.dart';
import 'models.dart';
import 'pages.dart';
import 'photo_upload_retry_policy.dart';
import 'photo_upload_telemetry.dart';
import 'printer_error.dart';
import 'qr_home_widgets.dart';
import 'qr_scan_action_model.dart';
import 'user_facing_error.dart';
import 'warehouse_constants.dart';
import 'warehouse_location_utils.dart';

part 'qr_home_page_menu.dart';
part 'qr_home_page_label_layout.dart';
part 'qr_home_page_core.dart';
part 'qr_home_page_system.dart';
part 'qr_home_page_print_connection.dart';
part 'qr_home_page_print_jobs.dart';
part 'qr_home_page_scan_remove_flow.dart';
part 'qr_home_page_scan_data.dart';
part 'qr_home_page_scan_forms.dart';
part 'qr_home_page_scan_palette.dart';
part 'qr_home_page_scan_helpers.dart';
part 'qr_home_page_scan_entrypoints.dart';
part 'qr_home_page_scan_add_handlers.dart';
part 'qr_home_page_scan_add_flow.dart';

class QrHomePage extends StatefulWidget {
  const QrHomePage({super.key});

  @override
  State<QrHomePage> createState() => _QrHomePageState();
}

class _QrHomePageState extends State<QrHomePage> with WidgetsBindingObserver {
  final List<IntakeData> _items = <IntakeData>[];
  final NiimbotLabelPrinter _printer = NiimbotLabelPrinter();
  final ImagePicker _imagePicker = ImagePicker();
  bool _adding = false;
  bool _removing = false;
  bool _printingImage = false;
  String? _printingItemId;
  bool _connectingPrinter = false;
  Future<void>? _connectPrinterFuture;
  bool _printerConnected = false;
  bool _preparingPrinter = false;
  int _printWidthPx = 384;
  int _printHeightPx = 640;
  int _printDensity = 5;
  int _printLabelType = 1;
  int _printInterLabelDelayMs = 120;
  bool _previewOnlyMode = false;
  double _labelQrScale = 0.78;
  double _labelQrOffsetX = 0;
  double _labelQrOffsetY = 0;
  double _labelMainScale = 1.0;
  double _labelMainOffsetX = 0;
  double _labelMainOffsetY = 0;
  double _labelPartsScale = 1.0;
  double _labelPartsOffsetX = 0;
  double _labelPartsOffsetY = 0;
  bool _loadingList = false;
  WebSocketChannel? _eventsChannel;
  StreamSubscription<dynamic>? _eventsSubscription;
  Timer? _eventsReconnectTimer;
  bool _eventsReconnectEnabled = true;
  final Map<String, String> _orderMemoById = <String, String>{};
  final Set<String> _memoLoading = <String>{};
  MobileUpdateInfo? _updateInfo;
  bool _checkingUpdates = false;
  bool _startupPermissionHandled = false;

  AppStrings get _strings => AppStrings.of(context);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshPrinterConnectionStatus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_startAuthenticatedHome());
    });
  }

  Future<void> _startAuthenticatedHome() async {
    final AppSettings settings = AppSettingsScope.of(context);
    final bool hasAccessToken = _authToken().isNotEmpty;
    final bool hasRefreshToken = settings.refreshToken.trim().isNotEmpty;
    if (!hasAccessToken && !hasRefreshToken) {
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
      return;
    }
    if (!hasAccessToken && hasRefreshToken) {
      final MobileAuthRefreshResult refresh =
          await _refreshAuthSessionDetailed();
      if (refresh.shouldLogout) {
        if (!mounted) {
          return;
        }
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
        return;
      }
    }
    if (!mounted) {
      return;
    }
    unawaited(_loadPrintSettings());
    unawaited(_connectEvents());
    _loadInitialIntakes();
    _checkForUpdates(silentIfLatest: true);
    unawaited(_runStartupPermissionFlow());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _eventsReconnectEnabled = false;
    _eventsReconnectTimer?.cancel();
    _eventsSubscription?.cancel();
    _eventsChannel?.sink.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshPrinterConnectionStatus());
      unawaited(_preparePrinterInBackground());
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    final AppSettings settings = AppSettingsScope.of(context);
    final List<GroupedIntakeData> groupedItems = _groupedItems();
    final int activeCount = groupedItems
        .where((GroupedIntakeData group) => !group.representative.isRemoved)
        .fold<int>(0, (int sum, GroupedIntakeData group) => sum + group.count);
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset(
                'assets/images/logo.png',
                width: 32,
                height: 32,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 12),
            const Text('Warehub'),
          ],
        ),
        actions: <Widget>[
          PopupMenuButton<String>(
            tooltip: strings.text('more'),
            onSelected: (String value) {
              unawaited(_handleAppBarMenuAction(value));
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              PopupMenuItem<String>(
                value: 'account',
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.logout_rounded, size: 18, color: uiMuted),
                    const SizedBox(width: 10),
                    Text(strings.text('logout')),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: 'language',
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.language_rounded,
                        size: 18, color: uiMuted),
                    const SizedBox(width: 10),
                    Text(strings.language),
                  ],
                ),
              ),
              PopupMenuItem<String>(
                value: 'check_updates',
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.system_update_alt_rounded,
                        size: 18, color: uiMuted),
                    const SizedBox(width: 10),
                    Text(
                      _updateInfo?.updateAvailable == true
                          ? strings.text('update_available')
                          : strings.text('check_updates'),
                    ),
                  ],
                ),
              ),
              if (_updateInfo?.updateAvailable == true)
                PopupMenuItem<String>(
                  value: 'update_app',
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.download_for_offline_rounded,
                          size: 18, color: uiMuted),
                      const SizedBox(width: 10),
                      Text(strings.text('update_app')),
                    ],
                  ),
                ),
              PopupMenuItem<String>(
                value: 'connect_printer',
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.print_rounded, size: 18, color: uiMuted),
                    const SizedBox(width: 10),
                    Text(
                      _printerConnected
                          ? strings.text('printer_connected')
                          : _connectingPrinter
                              ? '${strings.text('connect_printer')}...'
                              : strings.text('connect_printer'),
                    ),
                  ],
                ),
              ),
              if (settings.isAdmin)
                PopupMenuItem<String>(
                  value: 'printer_setup',
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.tune_rounded, size: 18, color: uiMuted),
                      const SizedBox(width: 10),
                      Text(strings.text('printer_setup')),
                    ],
                  ),
                ),
              if (settings.isAdmin)
                const PopupMenuItem<String>(
                  value: 'label_layout',
                  child: Row(
                    children: <Widget>[
                      Icon(Icons.crop_free_rounded, size: 18, color: uiMuted),
                      SizedBox(width: 10),
                      Text('Label layout'),
                    ],
                  ),
                ),
              if (settings.isAdmin)
                PopupMenuItem<String>(
                  value: 'print_image',
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.photo_library_rounded,
                          size: 18, color: uiMuted),
                      const SizedBox(width: 10),
                      Text(strings.text('print_image')),
                    ],
                  ),
                ),
            ],
            icon: const Icon(Icons.more_vert),
          ),
        ],
      ),
      body: SafeArea(
        child: Container(
          decoration: const BoxDecoration(gradient: appBackgroundGradient),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: appCardGradient,
                    border: Border.all(color: uiBorder),
                    boxShadow: const <BoxShadow>[
                      BoxShadow(
                        color: Color(0x66000000),
                        blurRadius: 22,
                        offset: Offset(0, 12),
                      ),
                    ],
                  ),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              strings.text('warehouse_feed'),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 22,
                                color: uiNavy,
                                letterSpacing: 0.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              strings.text('realtime_intakes'),
                              style: const TextStyle(
                                color: uiMuted,
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: uiCardSoft,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: uiBorder),
                        ),
                        child: Text(
                          strings.format(
                            'units_count',
                            <String, String>{'count': '$activeCount'},
                          ),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: uiNavy,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: _loadingList
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        onRefresh: _reloadList,
                        child: groupedItems.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding:
                                    const EdgeInsets.fromLTRB(16, 28, 16, 130),
                                children: <Widget>[
                                  Container(
                                    padding: const EdgeInsets.all(18),
                                    decoration: BoxDecoration(
                                      color: uiCardSoft,
                                      borderRadius: BorderRadius.circular(18),
                                      border: Border.all(
                                        color: uiBorder,
                                      ),
                                    ),
                                    child: Column(
                                      children: <Widget>[
                                        const Icon(
                                          Icons.inventory_2_outlined,
                                          size: 44,
                                          color: uiMuted,
                                        ),
                                        const SizedBox(height: 12),
                                        Text(
                                          strings.text('no_products'),
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                            color: uiMuted,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              )
                            : ListView.separated(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding:
                                    const EdgeInsets.fromLTRB(16, 8, 16, 120),
                                itemCount: groupedItems.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 10),
                                itemBuilder: (BuildContext context, int index) {
                                  final GroupedIntakeData grouped =
                                      groupedItems[index];
                                  final IntakeData item =
                                      grouped.representative;
                                  final String orderId =
                                      (parseQrData(item.qrCode).orderId ?? '')
                                          .trim();
                                  return QrHomeItemCard(
                                    item: item,
                                    photoUrls:
                                        _photoUrlsFromField(item.photoUrl),
                                    partsCount: grouped.partsCount,
                                    count: grouped.count,
                                    warehouseLocations:
                                        grouped.warehouseLocations,
                                    memo: orderId.isEmpty
                                        ? null
                                        : _orderMemoById[orderId],
                                    bWareComment: item.bWareComment,
                                    printing: _printingItemId == item.id,
                                    onPrint: (_adding ||
                                            _removing ||
                                            _printingItemId != null)
                                        ? null
                                        : () => _onPrintItem(item),
                                  );
                                },
                              ),
                      ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      floatingActionButton: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: appCtaGradient,
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x55203A56),
                blurRadius: 22,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: SizedBox(
            width: 64,
            height: 64,
            child: FilledButton(
              onPressed: (_adding ||
                      _removing ||
                      _printingItemId != null ||
                      _printingImage)
                  ? null
                  : _onScanTap,
              style: FilledButton.styleFrom(
                backgroundColor: Colors.transparent,
                disabledBackgroundColor: Colors.black26,
                shadowColor: Colors.transparent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: EdgeInsets.zero,
              ),
              child: (_adding || _removing)
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Icon(Icons.qr_code_scanner_rounded, size: 28),
            ),
          ),
        ),
      ),
    );
  }
}
