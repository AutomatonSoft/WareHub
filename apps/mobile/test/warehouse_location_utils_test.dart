import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/models.dart';
import 'package:sofortbot_mobile/warehouse_constants.dart';
import 'package:sofortbot_mobile/warehouse_location_utils.dart';

IntakeData _item({
  required String id,
  required String location,
  required int slotNumber,
  bool isRemoved = false,
  bool isActive = true,
}) {
  return IntakeData(
    id: id,
    qrCode: 'Q-$id',
    warehouseLocation: location,
    kidNumber: 'KID-$id',
    photoUrl: '',
    productKey: 'PK-$id',
    section: location.substring(0, 1),
    slotNumber: slotNumber,
    boxIndex: 1,
    boxTotal: 1,
    unitIndex: 1,
    isBWare: false,
    bWareComment: null,
    createdAt: '2026-01-01T00:00:00Z',
    isRemoved: isRemoved,
    isActive: isActive,
    removedAt: null,
  );
}

void main() {
  test('buildWarehouseLocation uppercases section and slot', () {
    expect(buildWarehouseLocation('a', '12b'), 'A12B');
  });

  test('parseWarehouseSlotNumber parses number from slot code', () {
    expect(parseWarehouseSlotNumber('1'), 1);
    expect(parseWarehouseSlotNumber('88A'), 88);
    expect(parseWarehouseSlotNumber(' 007b '), 7);
    expect(parseWarehouseSlotNumber('A88'), isNull);
  });

  test('parseWarehouseLocationFromQrPayload parses direct and embedded values', () {
    expect(parseWarehouseLocationFromQrPayload('d12'), 'D12');
    expect(parseWarehouseLocationFromQrPayload('  qr:D77b  '), 'D77B');
    expect(parseWarehouseLocationFromQrPayload('slot=K15;meta=x'), 'K15');
    expect(parseWarehouseLocationFromQrPayload('invalid'), isNull);
    expect(parseWarehouseLocationFromQrPayload('A0'), isNull);
    expect(parseWarehouseLocationFromQrPayload('B10001'), isNull);
  });

  test('parseWarehouseSectionAndSlot validates section and slot bounds', () {
    expect(parseWarehouseSectionAndSlot('D12'),
        const TypeMatcher<MapEntry<String, int>>());
    expect(parseWarehouseSectionAndSlot('D12')!.key, 'D');
    expect(parseWarehouseSectionAndSlot('D12')!.value, 12);
    expect(parseWarehouseSectionAndSlot('D12A')!.value, 12);
    expect(parseWarehouseSectionAndSlot('X0'), isNull);
    expect(parseWarehouseSectionAndSlot('X10001'), isNull);
    expect(parseWarehouseSectionAndSlot('12X'), isNull);
  });

  test('isWarehouseSlotOccupied checks slot globally across all sections', () {
    final List<IntakeData> items = <IntakeData>[
      _item(id: '1', location: 'F1', slotNumber: 1),
      _item(id: '4', location: 'D1', slotNumber: 1),
      _item(id: '2', location: 'D11', slotNumber: 11, isRemoved: true),
      _item(id: '3', location: 'D12', slotNumber: 12, isActive: false),
    ];

    expect(isWarehouseSlotOccupied(items, '1'), isTrue);
    expect(isWarehouseSlotOccupied(items, '1A'), isTrue);
    expect(isWarehouseSlotOccupied(items, '11'), isFalse);
    expect(isWarehouseSlotOccupied(items, '12'), isFalse);
    expect(isWarehouseSlotOccupied(items, '99'), isFalse);
    expect(isWarehouseSlotOccupied(items, '0'), isFalse);
  });

  test('findNextFreeWarehouseSlotCode returns first free global slot', () {
    final List<IntakeData> items = <IntakeData>[
      _item(id: '2', location: 'A1', slotNumber: 1),
      _item(id: '3', location: 'B2', slotNumber: 2),
      _item(id: '4', location: 'A3', slotNumber: 3, isRemoved: true),
    ];

    expect(
      findNextFreeWarehouseSlotCode(items),
      '3',
    );
  });

  test('findNextFreeWarehouseSlotCode returns null for invalid boundaries', () {
    expect(findNextFreeWarehouseSlotCode(const <IntakeData>[], minSlot: 0), isNull);
    expect(findNextFreeWarehouseSlotCode(const <IntakeData>[], maxSlot: 10001), isNull);
    expect(findNextFreeWarehouseSlotCode(const <IntakeData>[], minSlot: 5, maxSlot: 4), isNull);
  });

  test('warehouseSectionLabel maps A to Showroom', () {
    expect(warehouseSectionLabel('A'), 'Showroom');
    expect(warehouseSectionLabel('d'), 'D');
  });
}
