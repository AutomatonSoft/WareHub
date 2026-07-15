import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/models.dart';

void main() {
  test('InventoryFilterOptions maps all web filter option groups', () {
    final InventoryFilterOptions options = InventoryFilterOptions.fromJson(
      <String, dynamic>{
        'places': <String>['1A', '1B'],
        'sections': <String>['Showroom', 'A', 'B'],
        'locations': <String>['warehouse'],
        'quantities': <String>['1', '2'],
        'rooms': <String>['Wohnzimmer'],
        'types': <String>['Sofa'],
        'companies': <String>['Brand'],
        'colors': <String>['Blue'],
        'materials': <String>['Velvet'],
      },
    );

    expect(options.places, <String>['1A', '1B']);
    expect(options.sections, <String>['A', 'B']);
    expect(options.quantities, <String>['1', '2']);
    expect(options.rooms, <String>['Wohnzimmer']);
    expect(options.types, <String>['Sofa']);
    expect(options.companies, <String>['Brand']);
    expect(options.colors, <String>['Blue']);
    expect(options.materials, <String>['Velvet']);
  });

  test('API inventory models normalize Showroom as section A', () {
    final IntakeData item = IntakeData.fromJson(<String, dynamic>{
      'id': '1',
      'section': 'Showroom',
      'warehouse_location': 'Showroom12',
    });
    final PlacementLocation placement = PlacementLocation.fromJson(
      <String, dynamic>{
        'section': 'showroom',
        'warehouse_location': 'showroom 14',
      },
    );

    expect(item.section, 'A');
    expect(item.warehouseLocation, 'A12');
    expect(placement.section, 'A');
    expect(placement.warehouseLocation, 'A14');
  });
}
