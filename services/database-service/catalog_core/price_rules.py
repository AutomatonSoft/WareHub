from decimal import Decimal, ROUND_HALF_UP


def calculate_special_price(base_price: Decimal | None) -> Decimal | None:
    if base_price is None:
        return None

    price = Decimal(str(base_price))
    if price > Decimal("5000"):
        value = price * Decimal("1.10")
    elif Decimal("2500") <= price <= Decimal("4999"):
        value = price * Decimal("1.18")
    elif Decimal("1000") <= price <= Decimal("2499"):
        value = price * Decimal("1.25")
    else:
        value = price * Decimal("1.35")
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def apply_special_price_from_product(product) -> bool:
    """
    Recalculate product.specials[*].price from product.price.
    Works with both JV and XL ImportedProduct model aliases.
    """
    special_price = calculate_special_price(getattr(product, "price", None))
    if special_price is None:
        return False

    specials_qs = product.specials.all().order_by("id")
    specials = list(specials_qs)
    if not specials:
        special_model = product.specials.model
        special_model.objects.create(
            product=product,
            customer_group_id=1,
            priority=0,
            price=special_price,
            date_start=None,
            date_end=None,
            is_modified_locally=True,
        )
        return True

    first_by_group = {}
    duplicate_ids: list[int] = []
    for sp in specials:
        group_id = int(getattr(sp, "customer_group_id", 1) or 1)
        if group_id in first_by_group:
            duplicate_ids.append(sp.id)
            continue
        first_by_group[group_id] = sp

    if duplicate_ids:
        specials_qs.model.objects.filter(id__in=duplicate_ids).delete()
        specials = list(first_by_group.values())

    changed = False
    for sp in specials:
        if sp.price != special_price:
            sp.price = special_price
            changed = True
        sp.is_modified_locally = True

    if changed:
        specials_qs.model.objects.bulk_update(specials, ["price", "is_modified_locally"])
    return changed
