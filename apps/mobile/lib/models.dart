import 'warehouse_constants.dart';

class ParsedQrData {
  const ParsedQrData({
    required this.raw,
    this.orderId,
    this.kidNumber,
    this.kidNumber2,
  });

  final String raw;
  final String? orderId;
  final String? kidNumber;
  final String? kidNumber2;
}

enum ScanFlowAction { receive, unload }

class InventoryFilterOptions {
  const InventoryFilterOptions({
    this.places = const <String>[],
    this.sections = const <String>[],
    this.locations = const <String>[],
    this.quantities = const <String>[],
    this.rooms = const <String>[],
    this.types = const <String>[],
    this.companies = const <String>[],
    this.colors = const <String>[],
    this.materials = const <String>[],
  });

  final List<String> places;
  final List<String> sections;
  final List<String> locations;
  final List<String> quantities;
  final List<String> rooms;
  final List<String> types;
  final List<String> companies;
  final List<String> colors;
  final List<String> materials;

  factory InventoryFilterOptions.fromJson(Map<String, dynamic> json) {
    List<String> values(String key) =>
        (json[key] as List<dynamic>? ?? const <dynamic>[])
            .map((dynamic value) => '$value'.trim())
            .where((String value) => value.isNotEmpty)
            .toList(growable: false);

    final List<String> sections = values('sections')
        .map(normalizeWarehouseSection)
        .where((String value) => value.isNotEmpty)
        .toSet()
        .toList(growable: false);

    return InventoryFilterOptions(
      places: values('places'),
      sections: sections,
      locations: values('locations'),
      quantities: values('quantities'),
      rooms: values('rooms'),
      types: values('types'),
      companies: values('companies'),
      colors: values('colors'),
      materials: values('materials'),
    );
  }
}

class IntakeData {
  const IntakeData({
    required this.id,
    required this.databaseKidId,
    required this.qrCode,
    required this.warehouseLocation,
    required this.kidNumber,
    required this.photoUrl,
    required this.productKey,
    required this.section,
    required this.slotNumber,
    required this.boxIndex,
    required this.boxTotal,
    required this.unitIndex,
    required this.isBWare,
    required this.store,
    required this.inTransit,
    required this.stockStatus,
    this.bWareComment,
    required this.createdAt,
    required this.isRemoved,
    required this.isActive,
    this.removedAt,
  });

  final String id;
  final int databaseKidId;
  final String qrCode;
  final String warehouseLocation;
  final String kidNumber;
  final String photoUrl;
  final String productKey;
  final String section;
  final int slotNumber;
  final int boxIndex;
  final int boxTotal;
  final int unitIndex;
  final bool isBWare;
  final bool store;
  final bool inTransit;
  final String stockStatus;
  final String? bWareComment;
  final String createdAt;
  final bool isRemoved;
  final bool isActive;
  final String? removedAt;

  bool get isActiveEffective => isActive && !isRemoved;

  IntakeData copyWith({
    String? id,
    int? databaseKidId,
    String? qrCode,
    String? warehouseLocation,
    String? kidNumber,
    String? photoUrl,
    String? productKey,
    String? section,
    int? slotNumber,
    int? boxIndex,
    int? boxTotal,
    int? unitIndex,
    bool? isBWare,
    bool? store,
    bool? inTransit,
    String? stockStatus,
    String? bWareComment,
    String? createdAt,
    bool? isRemoved,
    bool? isActive,
    String? removedAt,
  }) {
    return IntakeData(
      id: id ?? this.id,
      databaseKidId: databaseKidId ?? this.databaseKidId,
      qrCode: qrCode ?? this.qrCode,
      warehouseLocation: warehouseLocation == null
          ? this.warehouseLocation
          : normalizeWarehouseLocation(warehouseLocation),
      kidNumber: kidNumber ?? this.kidNumber,
      photoUrl: photoUrl ?? this.photoUrl,
      productKey: productKey ?? this.productKey,
      section:
          section == null ? this.section : normalizeWarehouseSection(section),
      slotNumber: slotNumber ?? this.slotNumber,
      boxIndex: boxIndex ?? this.boxIndex,
      boxTotal: boxTotal ?? this.boxTotal,
      unitIndex: unitIndex ?? this.unitIndex,
      isBWare: isBWare ?? this.isBWare,
      store: store ?? this.store,
      inTransit: inTransit ?? this.inTransit,
      stockStatus: stockStatus ?? this.stockStatus,
      bWareComment: bWareComment ?? this.bWareComment,
      createdAt: createdAt ?? this.createdAt,
      isRemoved: isRemoved ?? this.isRemoved,
      isActive: isActive ?? this.isActive,
      removedAt: removedAt ?? this.removedAt,
    );
  }

  factory IntakeData.fromJson(Map<String, dynamic> json) {
    return IntakeData(
      id: '${json['id'] ?? ''}',
      databaseKidId: json['database_kid_id'] as int? ?? 0,
      qrCode: '${json['qr_code'] ?? ''}',
      warehouseLocation:
          normalizeWarehouseLocation('${json['warehouse_location'] ?? ''}'),
      kidNumber: '${json['kid_number'] ?? ''}',
      photoUrl: '${json['photo_url'] ?? ''}',
      productKey: '${json['product_key'] ?? ''}',
      section: normalizeWarehouseSection('${json['section'] ?? ''}'),
      slotNumber: json['slot_number'] as int? ?? 0,
      boxIndex: json['box_index'] as int? ?? 1,
      boxTotal: json['box_total'] as int? ?? 1,
      unitIndex: json['unit_index'] as int? ?? 1,
      isBWare: json['is_b_ware'] as bool? ?? false,
      store: json['store'] as bool? ?? false,
      inTransit: json['in_transit'] as bool? ?? false,
      stockStatus: '${json['stock_status'] ?? kStockStatusInStock}',
      bWareComment: json['b_ware_comment'] == null
          ? null
          : '${json['b_ware_comment']}'.trim().isEmpty
              ? null
              : '${json['b_ware_comment']}',
      createdAt: '${json['created_at'] ?? ''}',
      isRemoved: json['is_removed'] as bool? ?? false,
      isActive:
          json['is_active'] as bool? ?? !(json['is_removed'] as bool? ?? false),
      removedAt: json['removed_at'] == null ? null : '${json['removed_at']}',
    );
  }
}

class GroupedIntakeData {
  const GroupedIntakeData({
    required this.representative,
    required this.partsCount,
    required this.count,
    required this.warehouseLocations,
  });

  final IntakeData representative;
  final int partsCount;
  final int count;
  final List<String> warehouseLocations;
}

class PlacementLocation {
  const PlacementLocation({
    required this.section,
    required this.slotNumber,
    required this.warehouseLocation,
  });

  final String section;
  final int slotNumber;
  final String warehouseLocation;

  factory PlacementLocation.fromJson(Map<String, dynamic> json) {
    return PlacementLocation(
      section: normalizeWarehouseSection('${json['section'] ?? ''}'),
      slotNumber: json['slot_number'] as int? ?? 0,
      warehouseLocation:
          normalizeWarehouseLocation('${json['warehouse_location'] ?? ''}'),
    );
  }
}

class ExistingPlacement extends PlacementLocation {
  const ExistingPlacement({
    required super.section,
    required super.slotNumber,
    required super.warehouseLocation,
    required this.units,
  });

  final int units;

  factory ExistingPlacement.fromJson(Map<String, dynamic> json) {
    return ExistingPlacement(
      section: normalizeWarehouseSection('${json['section'] ?? ''}'),
      slotNumber: json['slot_number'] as int? ?? 0,
      warehouseLocation:
          normalizeWarehouseLocation('${json['warehouse_location'] ?? ''}'),
      units: json['units'] as int? ?? 0,
    );
  }
}

class PlacementSuggestion {
  const PlacementSuggestion({
    required this.productKey,
    required this.hasExisting,
    required this.existingLocation,
    required this.suggestedNewLocation,
    required this.nextUnitIndex,
  });

  final String productKey;
  final bool hasExisting;
  final ExistingPlacement? existingLocation;
  final PlacementLocation suggestedNewLocation;
  final int nextUnitIndex;

  factory PlacementSuggestion.fromJson(Map<String, dynamic> json) {
    final dynamic existingRaw = json['existing_location'];
    final dynamic suggestedRaw = json['suggested_new_location'];
    return PlacementSuggestion(
      productKey: '${json['product_key'] ?? ''}',
      hasExisting: json['has_existing'] as bool? ?? false,
      existingLocation: existingRaw is Map<String, dynamic>
          ? ExistingPlacement.fromJson(existingRaw)
          : null,
      suggestedNewLocation: suggestedRaw is Map<String, dynamic>
          ? PlacementLocation.fromJson(suggestedRaw)
          : const PlacementLocation(
              section: '',
              slotNumber: 0,
              warehouseLocation: '',
            ),
      nextUnitIndex: json['next_unit_index'] as int? ?? 1,
    );
  }
}

class IntakeWsEvent {
  const IntakeWsEvent({
    required this.kind,
    this.intake,
    this.intakeId,
  });

  final String kind;
  final IntakeData? intake;
  final String? intakeId;

  factory IntakeWsEvent.fromJson(Map<String, dynamic> json) {
    final dynamic rawIntake = json['intake'];
    return IntakeWsEvent(
      kind: '${json['kind'] ?? ''}',
      intake: rawIntake is Map<String, dynamic>
          ? IntakeData.fromJson(rawIntake)
          : null,
      intakeId: json['intake_id'] == null
          ? (json['intakeId'] == null ? null : '${json['intakeId']}')
          : '${json['intake_id']}',
    );
  }
}

class AfterbuyOrderItem {
  const AfterbuyOrderItem({
    required this.title,
    required this.quantity,
    this.articleNo,
    this.sku,
    this.ean,
    this.size,
    this.color,
    this.price,
    this.saleDate,
  });

  final String title;
  final int quantity;
  final String? articleNo;
  final String? sku;
  final String? ean;
  final String? size;
  final String? color;
  final String? price;
  final String? saleDate;

  factory AfterbuyOrderItem.fromJson(Map<String, dynamic> json) {
    return AfterbuyOrderItem(
      title: '${json['title'] ?? ''}',
      quantity: json['quantity'] as int? ?? 1,
      articleNo: json['article_no'] == null ? null : '${json['article_no']}',
      sku: json['sku'] == null ? null : '${json['sku']}',
      ean: json['ean'] == null ? null : '${json['ean']}',
      size: json['size'] == null ? null : '${json['size']}',
      color: json['color'] == null ? null : '${json['color']}',
      price: json['price'] == null ? null : '${json['price']}',
      saleDate: json['sale_date'] == null ? null : '${json['sale_date']}',
    );
  }
}

class AfterbuyOrderPayload {
  const AfterbuyOrderPayload({
    required this.orderId,
    required this.items,
    this.memo,
  });

  final String orderId;
  final List<AfterbuyOrderItem> items;
  final String? memo;

  factory AfterbuyOrderPayload.fromJson(Map<String, dynamic> json) {
    final dynamic rawItems = json['order_items'];
    final List<AfterbuyOrderItem> items = rawItems is List
        ? rawItems
            .whereType<Map<String, dynamic>>()
            .map(AfterbuyOrderItem.fromJson)
            .toList()
        : const <AfterbuyOrderItem>[];
    return AfterbuyOrderPayload(
      orderId: '${json['order_id'] ?? ''}',
      items: items,
      memo: json['memo'] == null ? null : '${json['memo']}',
    );
  }
}

ParsedQrData parseQrData(String rawValue) {
  final List<String> parts = rawValue
      .trim()
      .split('|')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList();

  return ParsedQrData(
    raw: rawValue,
    orderId: parts.isNotEmpty ? parts[0] : null,
    kidNumber: parts.length > 1 ? parts[1] : null,
    kidNumber2: parts.length > 2 ? parts[2] : null,
  );
}
