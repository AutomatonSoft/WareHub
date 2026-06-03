from django.contrib import admin

from .models import Kid, Orders


@admin.register(Kid)
class KidAdmin(admin.ModelAdmin):
    list_display = ("id", "kid_number", "account", "place")
    list_filter = ("account",)
    search_fields = ("kid_number", "account", "place")


@admin.register(Orders)
class OrdersAdmin(admin.ModelAdmin):
    list_display = ("id", "order_id", "kid", "platform", "buyer", "sku", "status", "date")
    list_filter = ("status", "date")
    search_fields = ("order_id", "platform", "buyer", "sku", "kid__kid_number")
