from django.contrib import admin
from .models import (
    HoodApiResponseJV,
    HoodApiResponseXL,
    HoodItemJV,
    HoodItemXL,
)


class BaseHoodApiResponseAdmin(admin.ModelAdmin):
    list_display = ("id", "account", "ean", "status", "success", "updated_at")
    search_fields = ("account", "ean", "status")
    list_filter = ("success", "status")


class BaseHoodItemAdmin(admin.ModelAdmin):
    list_display = ("id", "item_id", "item_number", "category_id", "updated_at")
    search_fields = ("item_id", "item_number", "title")


@admin.register(HoodApiResponseJV)
class HoodApiResponseJVAdmin(BaseHoodApiResponseAdmin):
    pass


@admin.register(HoodApiResponseXL)
class HoodApiResponseXLAdmin(BaseHoodApiResponseAdmin):
    pass


@admin.register(HoodItemJV)
class HoodItemJVAdmin(BaseHoodItemAdmin):
    pass


@admin.register(HoodItemXL)
class HoodItemXLAdmin(BaseHoodItemAdmin):
    pass
