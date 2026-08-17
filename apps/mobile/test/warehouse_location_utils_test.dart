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
    databaseKidId: 0,
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
    store: false,
    inTransit: false,
    stockStatus: kStockStatusInStock,
    bWareComment: null,
    createdAt: '2026-01-01T00:00:00Z',
    isRemoved: isRemoved,
    isActive: isActive,
    removedAt: null,
  );
}

void main() {
  test('formatInventoryProductHeading includes place, section and KID', () {
    expect(
      formatInventoryProductHeading(
        place: '1A',
        section: 'a',
        kidNumber: 'KID-42',
      ),
      'A / 1A - KID-42',
    );
    expect(
      formatInventoryProductHeading(
        place: '2B',
        section: '',
        kidNumber: 'KID-10',
      ),
      '2B - KID-10',
    );
    expect(
      formatInventoryProductHeading(
        place: '3C',
        section: 'Showroom',
        kidNumber: 'KID-11',
      ),
      'A / 3C - KID-11',
    );
  });

  test('compareWarehouseSections uses the warehouse section order', () {
    final List<String> sections = <String>['M', 'B', 'Showroom', 'K', 'X'];

    sections.sort(compareWarehouseSections);

    expect(sections, <String>['Showroom', 'B', 'K', 'M', 'X']);
  });

  test('compareWarehousePlaces uses natural place order', () {
    final List<String> places = <String>['10', '2A', '1B', '1A', '2', ''];

    places.sort(compareWarehousePlaces);

    expect(places, <String>['1A', '1B', '2', '2A', '10', '']);
  });

  test('buildWarehouseLocation uppercases section and slot', () {
    expect(buildWarehouseLocation('a', '12b'), 'A12B');
    expect(buildWarehouseLocation('Showroom', '12b'), 'A12B');
  });

  test('normalizeWarehousePlace does not prepend the selected section', () {
    expect(normalizeWarehousePlace(' 11a '), '11A');
    expect(normalizeWarehousePlace('12'), '12');
  });

  test('parseWarehouseSlotNumber parses number from slot code', () {
    expect(parseWarehouseSlotNumber('1'), 1);
    expect(parseWarehouseSlotNumber('88A'), 88);
    expect(parseWarehouseSlotNumber(' 007b '), 7);
    expect(parseWarehouseSlotNumber('A88'), isNull);
  });

  test('parseWarehouseLocationFromQrPayload parses direct and embedded values',
      () {
    expect(parseWarehouseLocationFromQrPayload('d12'), 'D12');
    expect(parseWarehouseLocationFromQrPayload('  qr:D77b  '), 'D77B');
    expect(parseWarehouseLocationFromQrPayload('slot=K15;meta=x'), 'K15');
    expect(parseWarehouseLocationFromQrPayload('Showroom12'), 'A12');
    expect(parseWarehouseLocationFromQrPayload('slot=showroom 14'), 'A14');
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
    expect(parseWarehouseSectionAndSlot('Showroom12')!.key, 'A');
    expect(parseWarehouseSectionAndSlot('X0'), isNull);
    expect(parseWarehouseSectionAndSlot('X10001'), isNull);
    expect(parseWarehouseSectionAndSlot('12X'), isNull);
  });

  test('isWarehousePlaceOccupied compares the complete place code', () {
    final List<IntakeData> items = <IntakeData>[
      _item(id: '1', location: '1A', slotNumber: 1),
      _item(id: '4', location: '1B', slotNumber: 1),
      _item(id: '2', location: '11A', slotNumber: 11, isRemoved: true),
      _item(id: '3', location: '12A', slotNumber: 12, isActive: false),
    ];

    expect(isWarehousePlaceOccupied(items, '1A'), isTrue);
    expect(isWarehousePlaceOccupied(items, '1b'), isTrue);
    expect(isWarehousePlaceOccupied(items, '1'), isFalse);
    expect(isWarehousePlaceOccupied(items, '11A'), isFalse);
    expect(isWarehousePlaceOccupied(items, '12A'), isFalse);
    expect(isWarehousePlaceOccupied(items, '99'), isFalse);
    expect(isWarehousePlaceOccupied(items, '0'), isFalse);
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

  test('findFreeWarehouseSlotCodes returns five available slots in order', () {
    final List<IntakeData> items = <IntakeData>[
      _item(id: '1', location: 'A1', slotNumber: 1),
      _item(id: '2', location: 'B3', slotNumber: 3),
      _item(id: '3', location: 'C4', slotNumber: 4),
      _item(id: '4', location: 'D2', slotNumber: 2, isRemoved: true),
    ];

    expect(
      findFreeWarehouseSlotCodes(items),
      <String>['2', '5', '6', '7', '8'],
    );
  });

  test('selectAvailableWarehouseSlotCodes uses server-provided places', () {
    expect(
      selectAvailableWarehouseSlotCodes(
        <String>['90', '91', '91', '92A', '0', '10001', '93', '94'],
      ),
      <String>['90', '91', '92A', '93', '94'],
    );
  });

  test('findNextFreeWarehouseSlotCode returns null for invalid boundaries', () {
    expect(findNextFreeWarehouseSlotCode(const <IntakeData>[], minSlot: 0),
        isNull);
    expect(findNextFreeWarehouseSlotCode(const <IntakeData>[], maxSlot: 10001),
        isNull);
    expect(
        findNextFreeWarehouseSlotCode(const <IntakeData>[],
            minSlot: 5, maxSlot: 4),
        isNull);
  });

  test('warehouse section normalization treats Showroom as A', () {
    expect(normalizeWarehouseSection('Showroom'), 'A');
    expect(normalizeWarehouseSection(' showroom '), 'A');
    expect(normalizeWarehouseSection('Шоурум'), 'A');
    expect(normalizeWarehouseLocation('Showroom 12b'), 'A12B');
    expect(warehouseSectionLabel('A'), 'A');
    expect(warehouseSectionLabel('Showroom'), 'A');
    expect(warehouseSectionLabel('d'), 'D');
  });
}
