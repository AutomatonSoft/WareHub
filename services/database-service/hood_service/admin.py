from django.contrib import admin
from .models import (
    HoodApiResponseJV,
    HoodApiResponseXL,
    HoodItemJV,
    HoodItemXL,
    HoodProductSnapshot,
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


@admin.register(HoodProductSnapshot)
class HoodProductSnapshotAdmin(admin.ModelAdmin):
    list_display = ("id", "account", "ean", "source_item_id", "saved_at", "restored_at")
    search_fields = ("account", "ean", "source_item_id")
