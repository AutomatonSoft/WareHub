// ignore_for_file: invalid_use_of_protected_member

part of 'qr_home_page.dart';

enum HomeTab {
  feed,
  settings,
}

enum SettingsTab {
  printer,
  profile,
}

enum InventoryDestinationFilter {
  warehouse,
  store,
}

extension _QrHomePageShell on _QrHomePageState {
  Widget _buildSelectedHomeTab({
    required List<GroupedIntakeData> groupedItems,
    required int? inventoryCount,
  }) {
    switch (_selectedHomeTab) {
      case HomeTab.feed:
        return _buildFeedTab(
          groupedItems: groupedItems,
          inventoryCount: inventoryCount,
        );
      case HomeTab.settings:
        return _buildSettingsTab();
    }
  }

  Widget _buildSettingsTab() {
    final List<Widget> tabHeader = <Widget>[
      SettingsSegmentedTabs(
        value: _selectedSettingsTab,
        onChanged: (SettingsTab tab) {
          setState(() {
            _selectedSettingsTab = tab;
          });
        },
      ),
      const SizedBox(height: 12),
    ];

    switch (_selectedSettingsTab) {
      case SettingsTab.printer:
        return Container(
          decoration: const BoxDecoration(gradient: appBackgroundGradient),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 118),
            children: <Widget>[
              ...tabHeader,
              _buildPrinterSettingsCard(),
            ],
          ),
        );
      case SettingsTab.profile:
        return MobileProfileTab(
          topChildren: tabHeader,
          onLogout: _onLogoutTap,
          onCheckUpdates: () => _checkForUpdates(silentIfLatest: false),
          onUpdateApp: _onUpdateTap,
          updateAvailable: _updateInfo?.updateAvailable == true,
          checkingUpdates: _checkingUpdates,
        );
    }
  }

  Widget _buildFeedTab({
    required List<GroupedIntakeData> groupedItems,
    required int? inventoryCount,
  }) {
    final AppStrings strings = AppStrings.of(context);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: _dismissInventoryKeyboard,
      child: NotificationListener<ScrollStartNotification>(
        onNotification: (ScrollStartNotification _) {
          _dismissInventoryKeyboard();
          return false;
        },
        child: Container(
          decoration: const BoxDecoration(gradient: appBackgroundGradient),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                child: AppSurface(
                  padding: const EdgeInsets.all(8),
                  backgroundColor: uiCard,
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: SizedBox(
                          height: AuthSpacing.buttonHeight,
                          child: TextField(
                            controller: _inventorySearchController,
                            textInputAction: TextInputAction.search,
                            textAlignVertical: TextAlignVertical.center,
                            style: AuthTextStyles.input,
                            cursorColor: AuthColors.foreground,
                            onSubmitted: (String value) {
                              unawaited(_submitInventorySearch(value));
                            },
                            onChanged: _onInventorySearchChanged,
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: AuthColors.muted,
                              border: OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.circular(AuthRadii.md),
                                borderSide: BorderSide.none,
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.circular(AuthRadii.md),
                                borderSide: BorderSide.none,
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.circular(AuthRadii.md),
                                borderSide: BorderSide.none,
                              ),
                              disabledBorder: OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.circular(AuthRadii.md),
                                borderSide: BorderSide.none,
                              ),
                              hintText: inventoryCount == null
                                  ? strings
                                      .text('inventory_search_loading_hint')
                                  : strings.format(
                                      'inventory_search_hint',
                                      <String, String>{
                                        'count': '$inventoryCount',
                                      },
                                    ),
                              prefixIcon: const Icon(
                                Icons.search_rounded,
                                color: uiMuted,
                              ),
                              suffixIcon: _inventorySearch.isEmpty
                                  ? null
                                  : IconButton(
                                      tooltip: strings.text('reset'),
                                      onPressed: () {
                                        unawaited(_clearInventorySearch());
                                      },
                                      icon: const Icon(
                                        Icons.close_rounded,
                                        color: uiMuted,
                                      ),
                                    ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AuthSpacing.md,
                                vertical: AuthSpacing.md,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _InventoryFilterButton(
                        activeCount: _activeInventoryFilterCount,
                        label: _activeInventoryFilterCount == 0
                            ? strings.text('filter_list')
                            : strings.format(
                                'active_filters_count',
                                <String, String>{
                                  'count': '$_activeInventoryFilterCount',
                                },
                              ),
                        onTap: _openInventoryFilters,
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: _loadingList
                    ? const Center(child: AppLoadingIndicator())
                    : RefreshIndicator(
                        onRefresh: _reloadList,
                        color: uiGreen,
                        backgroundColor: uiCard,
                        child: groupedItems.isEmpty
                            ? ListView(
                                controller: _feedScrollController,
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding:
                                    const EdgeInsets.fromLTRB(16, 28, 16, 118),
                                children: <Widget>[
                                  AppSurface(
                                    backgroundColor: uiCardSoft,
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
                                          style: AuthTextStyles.helper.copyWith(
                                            fontSize: 14,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              )
                            : ListView.separated(
                                controller: _feedScrollController,
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding:
                                    const EdgeInsets.fromLTRB(16, 8, 16, 118),
                                itemCount: groupedItems.length +
                                    (_loadingMoreList ? 1 : 0),
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 10),
                                itemBuilder: (BuildContext context, int index) {
                                  if (index >= groupedItems.length) {
                                    return const Padding(
                                      padding:
                                          EdgeInsets.symmetric(vertical: 14),
                                      child: Center(
                                        child: AppLoadingIndicator(),
                                      ),
                                    );
                                  }
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
    );
  }

  void _dismissInventoryKeyboard() {
    FocusManager.instance.primaryFocus?.unfocus();
  }

  Future<void> _openInventoryFilters() async {
    if (!mounted) return;
    final Future<void> filterOptionsFuture = _loadInventoryFilterOptions();
    String? place = _inventoryPlace;
    String? section = _inventorySection;
    String? quantity = _inventoryQuantity;
    String? room = _inventoryRoom;
    String? type = _inventoryType;
    String? company = _inventoryCompany;
    String? color = _inventoryColor;
    String? material = _inventoryMaterial;
    InventoryDestinationFilter? destination = _inventoryDestination;
    bool? bWare = _inventoryBWare;
    bool? inTransit = _inventoryInTransit;
    final AppStrings strings = AppStrings.of(context);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext context) => FutureBuilder<void>(
        future: filterOptionsFuture,
        builder: (BuildContext context, AsyncSnapshot<void> snapshot) =>
            StatefulBuilder(
          builder: (BuildContext context, StateSetter setSheetState) =>
              Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.9,
            ),
            decoration: const BoxDecoration(
              color: uiCard,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(AuthRadii.xl),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AuthColors.border,
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: <Widget>[
                        const Icon(Icons.tune_rounded, color: uiBrandGreen),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            strings.text('filter_list'),
                            style: AuthTextStyles.title.copyWith(fontSize: 22),
                          ),
                        ),
                        if (snapshot.connectionState == ConnectionState.waiting)
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: uiBrandGreen,
                            ),
                          )
                        else if (_activeInventoryFilterCount > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: uiBrandGreenSoft,
                              borderRadius: BorderRadius.circular(AuthRadii.sm),
                            ),
                            child: Text(
                              '$_activeInventoryFilterCount',
                              style: AuthTextStyles.label.copyWith(
                                color: uiBrandGreen,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Expanded(
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: <Widget>[
                            if (snapshot.hasError)
                              Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AuthColors.destructive.withValues(
                                    alpha: 0.08,
                                  ),
                                  borderRadius:
                                      BorderRadius.circular(AuthRadii.md),
                                ),
                                child: Text(
                                  strings.text('load_filters_failed'),
                                  style: AuthTextStyles.helper.copyWith(
                                    color: AuthColors.destructive,
                                  ),
                                ),
                              ),
                            _InventoryFilterSelect(
                              label: strings.text('filter_place'),
                              allLabel: strings.text('all_places'),
                              value: place,
                              options: _inventoryFilterOptions.places,
                              onChanged: (String? value) =>
                                  setSheetState(() => place = value),
                            ),
                            _InventoryFilterSelect(
                              label: strings.text('filter_section'),
                              allLabel: strings.text('all_sections'),
                              value: section,
                              options: <String>{
                                ...kWarehouseSections,
                                ..._inventoryFilterOptions.sections,
                              }.toList(growable: false),
                              onChanged: (String? value) =>
                                  setSheetState(() => section = value),
                            ),
                            _InventoryFilterGroup(
                              title: strings.text('filter_destination'),
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: <Widget>[
                                  _InventoryFilterOption(
                                      label: strings.text('all_destinations'),
                                      selected: destination == null,
                                      onTap: () => setSheetState(
                                          () => destination = null)),
                                  _InventoryFilterOption(
                                      label: strings.text('warehouse'),
                                      icon: Icons.warehouse_outlined,
                                      selected: destination ==
                                          InventoryDestinationFilter.warehouse,
                                      onTap: () => setSheetState(() =>
                                          destination =
                                              InventoryDestinationFilter
                                                  .warehouse)),
                                  _InventoryFilterOption(
                                      label: strings.text('store'),
                                      icon: Icons.storefront_outlined,
                                      selected: destination ==
                                          InventoryDestinationFilter.store,
                                      onTap: () => setSheetState(() =>
                                          destination =
                                              InventoryDestinationFilter
                                                  .store)),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            _InventoryFilterSelect(
                                label: strings.text('filter_quantity'),
                                allLabel: strings.text('all_quantities'),
                                value: quantity,
                                options: _inventoryFilterOptions.quantities,
                                onChanged: (String? value) =>
                                    setSheetState(() => quantity = value)),
                            _InventoryFilterSelect(
                                label: strings.text('filter_room'),
                                allLabel: strings.text('all_rooms'),
                                value: room,
                                options: _inventoryFilterOptions.rooms,
                                onChanged: (String? value) =>
                                    setSheetState(() => room = value)),
                            _InventoryFilterSelect(
                                label: strings.text('filter_type'),
                                allLabel: strings.text('all_types'),
                                value: type,
                                options: _inventoryFilterOptions.types,
                                onChanged: (String? value) =>
                                    setSheetState(() => type = value)),
                            _InventoryFilterSelect(
                                label: strings.text('filter_company'),
                                allLabel: strings.text('all_companies'),
                                value: company,
                                options: _inventoryFilterOptions.companies,
                                onChanged: (String? value) =>
                                    setSheetState(() => company = value)),
                            _InventoryFilterSelect(
                                label: strings.text('filter_color'),
                                allLabel: strings.text('all_colors'),
                                value: color,
                                options: _inventoryFilterOptions.colors,
                                onChanged: (String? value) =>
                                    setSheetState(() => color = value)),
                            _InventoryFilterSelect(
                                label: strings.text('filter_material'),
                                allLabel: strings.text('all_materials'),
                                value: material,
                                options: _inventoryFilterOptions.materials,
                                onChanged: (String? value) =>
                                    setSheetState(() => material = value)),
                            _InventoryFilterGroup(
                              title: strings.text('filter_status'),
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: <Widget>[
                                  _InventoryFilterOption(
                                      label: strings.text('b_ware_only'),
                                      icon: Icons.verified_outlined,
                                      selected: bWare == true,
                                      onTap: () => setSheetState(() =>
                                          bWare = bWare == true ? null : true)),
                                  _InventoryFilterOption(
                                      label: strings.text('in_transit_only'),
                                      icon: Icons.local_shipping_outlined,
                                      selected: inTransit == true,
                                      onTap: () => setSheetState(() =>
                                          inTransit =
                                              inTransit == true ? null : true)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: AppTextButton(
                            label: strings.text('reset'),
                            onPressed: () {
                              unawaited(_applyInventoryFilters(
                                place: null,
                                section: null,
                                quantity: null,
                                room: null,
                                type: null,
                                company: null,
                                color: null,
                                material: null,
                                destination: null,
                                bWare: null,
                                inTransit: null,
                              ));
                              Navigator.of(context).pop();
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: AppPrimaryButton(
                            label: strings.text('apply'),
                            icon: Icons.check_rounded,
                            onPressed: () {
                              unawaited(_applyInventoryFilters(
                                place: place,
                                section: section,
                                quantity: quantity,
                                room: room,
                                type: type,
                                company: company,
                                color: color,
                                material: material,
                                destination: destination,
                                bWare: bWare,
                                inTransit: inTransit,
                              ));
                              Navigator.of(context).pop();
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPrinterSettingsCard() {
    final AppStrings strings = AppStrings.of(context);
    final AppSettings settings = AppSettingsScope.of(context);
    final bool busy =
        _adding || _removing || _printingItemId != null || _printingImage;
    return AppSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            strings.text('printer_actions'),
            style: AuthTextStyles.title.copyWith(fontSize: 24),
          ),
          const SizedBox(height: 8),
          Text(
            _printerConnected
                ? strings.text('printer_connected')
                : strings.text('select_printer'),
            style: AuthTextStyles.subtitle,
          ),
          const SizedBox(height: 18),
          AppActionTile(
            icon: Icons.print_rounded,
            title: _printerConnected
                ? strings.text('printer_connected')
                : _connectingPrinter
                    ? '${strings.text('connect_printer')}...'
                    : strings.text('connect_printer'),
            enabled: !_connectingPrinter,
            onTap: _onConnectPrinterTap,
          ),
          if (settings.isAdmin) ...<Widget>[
            const SizedBox(height: 10),
            AppActionTile(
              icon: Icons.tune_rounded,
              title: strings.text('printer_setup'),
              enabled: !busy,
              onTap: _openPrintSettingsDialog,
            ),
            const SizedBox(height: 10),
            AppActionTile(
              icon: Icons.crop_free_rounded,
              title: strings.text('label_layout'),
              enabled: !busy,
              onTap: _openLabelLayoutEditorDialog,
            ),
            const SizedBox(height: 10),
            AppActionTile(
              icon: Icons.photo_library_rounded,
              title: strings.text('print_image'),
              enabled: !busy,
              onTap: _onPickAndPrintImage,
            ),
          ],
        ],
      ),
    );
  }
}

class SettingsSegmentedTabs extends StatelessWidget {
  const SettingsSegmentedTabs({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final SettingsTab value;
  final ValueChanged<SettingsTab> onChanged;

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return AppSurface(
      padding: const EdgeInsets.all(6),
      backgroundColor: uiCardSoft,
      child: Row(
        children: <Widget>[
          Expanded(
            child: _SettingsTabButton(
              selected: value == SettingsTab.printer,
              icon: Icons.print_rounded,
              label: strings.text('printer_actions'),
              onTap: () => onChanged(SettingsTab.printer),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _SettingsTabButton(
              selected: value == SettingsTab.profile,
              icon: Icons.person_rounded,
              label: strings.text('profile'),
              onTap: () => onChanged(SettingsTab.profile),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsTabButton extends StatelessWidget {
  const _SettingsTabButton({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        height: 46,
        decoration: BoxDecoration(
          color: selected ? uiBrandGreen : Colors.transparent,
          borderRadius: BorderRadius.circular(AuthRadii.md),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(
              icon,
              size: 18,
              color: selected ? Colors.white : uiMuted,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AuthTextStyles.language.copyWith(
                  color: selected ? Colors.white : uiMuted,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeBottomNavBar extends StatelessWidget {
  const HomeBottomNavBar({
    super.key,
    required this.value,
    required this.scanBusy,
    required this.onScan,
    required this.onChanged,
  });

  final HomeTab value;
  final bool scanBusy;
  final VoidCallback onScan;
  final ValueChanged<HomeTab> onChanged;

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: uiBrandGreenSoft,
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: AuthColors.foreground.withValues(alpha: 0.10),
            blurRadius: 18,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 76,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Stack(
              alignment: Alignment.bottomCenter,
              clipBehavior: Clip.none,
              children: <Widget>[
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: _HomeBottomNavItem(
                          tab: HomeTab.feed,
                          value: value,
                          icon: Icons.inventory_2_rounded,
                          label: strings.text('products_tab'),
                          onChanged: onChanged,
                        ),
                      ),
                      const SizedBox(width: 84),
                      Expanded(
                        child: _HomeBottomNavItem(
                          tab: HomeTab.settings,
                          value: value,
                          icon: Icons.settings_rounded,
                          label: strings.text('settings'),
                          onChanged: onChanged,
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  top: -16,
                  child: _QrScanNavButton(
                    scanBusy: scanBusy,
                    onScan: onScan,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _QrScanNavButton extends StatefulWidget {
  const _QrScanNavButton({
    required this.scanBusy,
    required this.onScan,
  });

  final bool scanBusy;
  final VoidCallback onScan;

  @override
  State<_QrScanNavButton> createState() => _QrScanNavButtonState();
}

class _QrScanNavButtonState extends State<_QrScanNavButton> {
  bool _pressed = false;

  void _setPressed(bool pressed) {
    if (_pressed == pressed || widget.scanBusy) {
      return;
    }
    setState(() {
      _pressed = pressed;
    });
  }

  @override
  void didUpdateWidget(covariant _QrScanNavButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.scanBusy && _pressed) {
      _pressed = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool enabled = !widget.scanBusy;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? widget.onScan : null,
      onTapDown: enabled ? (_) => _setPressed(true) : null,
      onTapUp: enabled ? (_) => _setPressed(false) : null,
      onTapCancel: enabled ? () => _setPressed(false) : null,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOutCubic,
        scale: _pressed ? 0.94 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: widget.scanBusy
                ? AuthColors.primary.withValues(alpha: 0.52)
                : AuthColors.primary,
            borderRadius: BorderRadius.circular(22),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: AuthColors.primary.withValues(alpha: 0.22),
                blurRadius: 22,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: widget.scanBusy
              ? const Center(
                  child: AppLoadingIndicator(color: Colors.white),
                )
              : const Icon(
                  Icons.qr_code_scanner_rounded,
                  color: Colors.white,
                  size: 32,
                ),
        ),
      ),
    );
  }
}

class _HomeBottomNavItem extends StatelessWidget {
  const _HomeBottomNavItem({
    required this.tab,
    required this.value,
    required this.icon,
    required this.label,
    required this.onChanged,
  });

  final HomeTab tab;
  final HomeTab value;
  final IconData icon;
  final String label;
  final ValueChanged<HomeTab> onChanged;

  @override
  Widget build(BuildContext context) {
    final bool selected = tab == value;
    final Color foreground = selected ? uiBrandGreen : uiMuted;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onChanged(tab),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          height: 54,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(icon, size: 21, color: foreground),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AuthTextStyles.helper.copyWith(
                  color: foreground,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InventoryFilterButton extends StatelessWidget {
  const _InventoryFilterButton({
    required this.activeCount,
    required this.label,
    required this.onTap,
  });

  final int activeCount;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool active = activeCount > 0;
    return Semantics(
      button: true,
      label: label,
      child: Tooltip(
        message: label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: AuthSpacing.buttonHeight,
            height: AuthSpacing.buttonHeight,
            decoration: BoxDecoration(
              color: active ? uiBrandGreen : uiCardSoft,
              borderRadius: BorderRadius.circular(AuthRadii.md),
            ),
            child: Icon(
              Icons.tune_rounded,
              size: 21,
              color: active ? Colors.white : uiText,
            ),
          ),
        ),
      ),
    );
  }
}

class _InventoryFilterGroup extends StatelessWidget {
  const _InventoryFilterGroup({
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(title, style: AuthTextStyles.label),
        const SizedBox(height: 9),
        child,
      ],
    );
  }
}

class _InventoryFilterSelect extends StatelessWidget {
  const _InventoryFilterSelect({
    required this.label,
    required this.allLabel,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String allLabel;
  final String? value;
  final List<String> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final List<String> values = <String>{
      if (value != null && value!.trim().isNotEmpty) value!.trim(),
      ...options
          .map((String option) => option.trim())
          .where((String option) => option.isNotEmpty),
    }.toList(growable: false);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: AppSelectField<String>(
        label: label,
        value: value ?? '',
        options: <AppSelectOption<String>>[
          AppSelectOption<String>(value: '', label: allLabel),
          ...values.map(
            (String option) =>
                AppSelectOption<String>(value: option, label: option),
          ),
        ],
        onChanged: (String next) => onChanged(next.isEmpty ? null : next),
      ),
    );
  }
}

class _InventoryFilterOption extends StatelessWidget {
  const _InventoryFilterOption({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final Color foreground = selected ? Colors.white : uiText;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: selected ? uiBrandGreen : uiCardSoft,
            borderRadius: BorderRadius.circular(AuthRadii.sm),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (icon != null) ...<Widget>[
                Icon(icon, size: 17, color: foreground),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: AuthTextStyles.label.copyWith(color: foreground),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AppSurface extends StatelessWidget {
  const AppSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.backgroundColor = uiCard,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AuthRadii.xl),
      ),
      child: child,
    );
  }
}

class AppActionTile extends StatelessWidget {
  const AppActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 160),
        opacity: enabled ? 1 : 0.45,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: uiCardSoft,
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          child: Row(
            children: <Widget>[
              Icon(icon, color: uiMuted, size: 22),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      title,
                      style: AuthTextStyles.language.copyWith(fontSize: 15),
                    ),
                    if ((subtitle ?? '').trim().isNotEmpty) ...<Widget>[
                      const SizedBox(height: 3),
                      Text(
                        subtitle!.trim(),
                        style: AuthTextStyles.helper,
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: uiMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class AppPrimaryButton extends StatelessWidget {
  const AppPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.destructive = false,
    this.backgroundColor,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool destructive;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null && !loading;
    final Color background =
        backgroundColor ?? (destructive ? AuthColors.destructive : uiGreen);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onPressed : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 160),
        opacity: enabled ? 1 : 0.55,
        child: Container(
          height: AuthSpacing.buttonHeight,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          child: loading
              ? const AppLoadingIndicator(color: Colors.white)
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    if (icon != null) ...<Widget>[
                      Icon(icon, color: Colors.white, size: 20),
                      const SizedBox(width: 8),
                    ],
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AuthTextStyles.button,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class AppTextButton extends StatelessWidget {
  const AppTextButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onPressed,
      child: Container(
        height: AuthSpacing.buttonHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: uiCardSoft,
          borderRadius: BorderRadius.circular(AuthRadii.md),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (icon != null) ...<Widget>[
              Icon(icon, color: uiText, size: 20),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AuthTextStyles.language.copyWith(fontSize: 15),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppInputField extends StatelessWidget {
  const AppInputField({
    super.key,
    required this.controller,
    required this.label,
    this.keyboardType,
    this.obscureText = false,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String label;
  final TextInputType? keyboardType;
  final bool obscureText;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label, style: AuthTextStyles.label),
        const SizedBox(height: 8),
        Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: uiCardSoft,
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          child: TextField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: obscureText,
            maxLines: obscureText ? 1 : maxLines,
            style: AuthTextStyles.input,
            decoration: const InputDecoration(
              filled: false,
              contentPadding: EdgeInsets.symmetric(
                horizontal: AuthSpacing.md,
                vertical: AuthSpacing.md,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class AppLoadingIndicator extends StatelessWidget {
  const AppLoadingIndicator({
    super.key,
    this.color = uiGreen,
    this.size = 22,
  });

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: 2.2,
        valueColor: AlwaysStoppedAnimation<Color>(color),
      ),
    );
  }
}
