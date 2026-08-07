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
import 'auth_design_tokens.dart';
import 'auth_widgets.dart';
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
import 'qr_home_item_details_page.dart';
import 'qr_scan_action_model.dart';
import 'user_facing_error.dart';
import 'warehouse_constants.dart';
import 'warehouse_location_utils.dart';
import 'warehouse_map_sheet.dart';

part 'qr_home_page_menu.dart';
part 'qr_home_page_printer_ui.dart';
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
part 'qr_home_page_select.dart';
part 'qr_home_page_shell.dart';
part 'qr_home_page_profile.dart';

class QrHomePage extends StatefulWidget {
  const QrHomePage({super.key});

  @override
  State<QrHomePage> createState() => _QrHomePageState();
}

class _QrHomePageState extends State<QrHomePage> with WidgetsBindingObserver {
  static const int _inventoryPageSize = 20;

  final List<IntakeData> _items = <IntakeData>[];
  final ScrollController _feedScrollController = ScrollController();
  final TextEditingController _inventorySearchController =
      TextEditingController();
  final NiimbotLabelPrinter _printer = NiimbotLabelPrinter();
  final ImagePicker _imagePicker = ImagePicker();
  bool _adding = false;
  bool _removing = false;
  bool _printingImage = false;
  String? _printingItemId;
  HomeTab _selectedHomeTab = HomeTab.feed;
  SettingsTab _selectedSettingsTab = SettingsTab.printer;
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
  bool _loadingMoreList = false;
  bool _inventoryHasMore = true;
  int _inventoryNextOffset = 0;
  int? _inventoryTotalCount;
  String _inventorySearch = '';
  int _inventoryQueryRevision = 0;
  InventoryFilterOptions _inventoryFilterOptions =
      const InventoryFilterOptions();
  String? _inventoryPlace;
  String? _inventorySection;
  String? _inventoryQuantity;
  String? _inventoryRoom;
  String? _inventoryType;
  String? _inventoryCompany;
  String? _inventoryColor;
  String? _inventoryMaterial;
  InventoryDestinationFilter? _inventoryDestination;
  bool? _inventoryBWare;
  bool? _inventoryInTransit;
  WebSocketChannel? _eventsChannel;
  StreamSubscription<dynamic>? _eventsSubscription;
  Timer? _eventsReconnectTimer;
  Timer? _inventorySearchDebounceTimer;
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
    _feedScrollController.addListener(_onFeedScroll);
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
    _inventorySearchDebounceTimer?.cancel();
    _eventsSubscription?.cancel();
    _eventsChannel?.sink.close();
    _feedScrollController
      ..removeListener(_onFeedScroll)
      ..dispose();
    _inventorySearchController.dispose();
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
    final List<GroupedIntakeData> groupedItems = _groupedItems();
    final AppStrings strings = AppStrings.of(context);
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
          IconButton(
            tooltip: strings.text('warehouse_map'),
            onPressed: () => showWarehouseMapSheet(
              context,
              strings: strings,
            ),
            icon: const Icon(
              Icons.map_outlined,
              color: AuthColors.mutedForeground,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: AuthLanguagePicker(
              label: strings.language,
              value: AppSettingsScope.of(context).language,
              onChanged: (AppLang lang) {
                unawaited(AppSettingsScope.of(context).setLanguage(lang));
              },
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: _buildSelectedHomeTab(
          groupedItems: groupedItems,
          inventoryCount: _inventoryTotalCount,
        ),
      ),
      bottomNavigationBar: HomeBottomNavBar(
        value: _selectedHomeTab,
        scanBusy:
            _adding || _removing || _printingItemId != null || _printingImage,
        onScan: _onScanTap,
        onChanged: (HomeTab tab) {
          setState(() {
            _selectedHomeTab = tab;
          });
        },
      ),
    );
  }
}
