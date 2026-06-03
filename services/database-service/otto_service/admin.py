from django.contrib import admin
from .models import OttoProductJV, OttoProductXL


class BaseOttoProductAdmin(admin.ModelAdmin):
    list_display = ("id", "product_reference", "sku", "ean", "updated_at")
    search_fields = ("product_reference", "sku", "ean", "mpn", "moin")


@admin.register(OttoProductJV)
class OttoProductJVAdmin(BaseOttoProductAdmin):
    pass


@admin.register(OttoProductXL)
class OttoProductXLAdmin(BaseOttoProductAdmin):
    pass
