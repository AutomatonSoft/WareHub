from .category_cache import OttoCategoryCache


class OttoTaxonomyUnavailable(Exception):
    pass


def attribute_errors(description, taxonomy, path):
    if not isinstance(taxonomy, list) or any(
        not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip()
        or not isinstance(item.get("allowedValues", []), list)
        for item in taxonomy
    ):
        raise OttoTaxonomyUnavailable("Invalid cached attribute schema.")
    attributes = description.get("attributes", [])
    if not isinstance(attributes, list):
        return [{"field": f"{path}.attributes", "code": "invalid_attributes", "message": "Атрибуты должны быть списком."}]
    supplied = {}
    errors = []
    for index, attribute in enumerate(attributes):
        field = f"{path}.attributes[{index}]"
        if not isinstance(attribute, dict) or not isinstance(attribute.get("name"), str):
            errors.append({"field": field, "code": "invalid_attribute", "message": "Укажите название атрибута."})
            continue
        name = attribute["name"].strip()
        values = attribute.get("values")
        if not isinstance(values, list) or not values or any(not isinstance(value, str) or not value.strip() for value in values):
            errors.append({"field": f"{field}.values", "attribute": name, "code": "invalid_attribute_values", "message": f"Заполните значения атрибута «{name}»."})
            continue
        if name in supplied:
            errors.append({"field": field, "attribute": name, "code": "duplicate_attribute", "message": f"Атрибут «{name}» указан несколько раз."})
        supplied[name] = (values, field)
    for definition in taxonomy:
        name = definition["name"].strip()
        entry = supplied.get(name)
        if entry is None:
            if str(definition.get("relevance", "")).upper() == "HIGH":
                errors.append({"field": f"{path}.attributes", "attribute": name, "code": "required_attribute_missing", "message": f"Заполните обязательный атрибут «{name}»."})
            continue
        values, field = entry
        allowed = definition.get("allowedValues", [])
        if allowed and any(value not in allowed for value in values):
            errors.append({"field": f"{field}.values", "attribute": name, "code": "attribute_value_not_allowed", "allowed_values": allowed, "message": f"Выберите допустимое значение атрибута «{name}»."})
        if definition.get("multiValue") is False and len(values) > 1:
            errors.append({"field": f"{field}.values", "attribute": name, "code": "attribute_single_value", "message": f"Для атрибута «{name}» разрешено одно значение."})
    return errors


def validate_product_attributes(products):
    cache = None
    loaded = {}
    errors = []
    for index, product in enumerate(products):
        description = product.get("productDescription")
        if description is None:
            continue
        path = f"items[{index}].productDescription"
        if not isinstance(description, dict):
            errors.append({"field": path, "code": "invalid_description", "message": "Описание товара должно быть объектом."})
            continue
        category = description.get("category")
        if category is None:
            continue
        if not isinstance(category, str) or not category.strip():
            errors.append({"field": f"{path}.category", "code": "category_required", "message": "Выберите категорию OTTO."})
            continue
        category = category.strip()
        if category not in loaded:
            if cache is None:
                cache = OttoCategoryCache()
            category_id = cache.category_id_by_name(category)
            if category_id is None:
                raise OttoTaxonomyUnavailable("Category cannot be resolved uniquely from the cache.")
            taxonomy = cache.attributes(category_id)
            if taxonomy is None:
                raise OttoTaxonomyUnavailable("Category attributes are not cached.")
            loaded[category] = taxonomy
        errors.extend(attribute_errors(description, loaded[category], path))
    return errors
