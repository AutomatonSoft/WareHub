from django.contrib import admin

from .kid_number_utils import kid_number_contains
from .models import Kid, Orders


@admin.register(Kid)
class KidAdmin(admin.ModelAdmin):
    list_display = ("id", "kid_number", "account", "place")
    list_filter = ("account",)
    search_fields = ("account", "place")

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        normalized = str(search_term or "").strip()
        if not normalized:
            return queryset, use_distinct
        matched_ids = [kid.id for kid in Kid.objects.only("id", "kid_number") if kid_number_contains(kid.kid_number, normalized)]
        return (queryset | Kid.objects.filter(id__in=matched_ids)), use_distinct


@admin.register(Orders)
class OrdersAdmin(admin.ModelAdmin):
    list_display = ("id", "order_id", "kid", "platform", "buyer", "sku", "status", "date")
    list_filter = ("status", "date")
    search_fields = ("order_id", "platform", "buyer", "sku")

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        normalized = str(search_term or "").strip()
        if not normalized:
            return queryset, use_distinct
        matched_kid_ids = [kid.id for kid in Kid.objects.only("id", "kid_number") if kid_number_contains(kid.kid_number, normalized)]
        return (queryset | Orders.objects.filter(kid_id__in=matched_kid_ids)), use_distinct
