"""
URL configuration for database_service project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONOpenAPIRenderer
from rest_framework.response import Response
from rest_framework.views import APIView
from database.views import (
    EANPoolImportAPIView,
    EANPoolClaimForJobAPIView,
    EANPoolMarkJobUsedAPIView,
    EANPoolMarkUsedAPIView,
    EANPoolReserveAPIView,
    EANPoolStatsAPIView,
    EANPoolTakeNextFreeAPIView,
    EANPoolUsageByEANAPIView,
    InventoryDashboardSummaryAPIView,
    CriticalInventoryAPIView,
    InventoryChangeHistoryAPIView,
    InventoryFilterOptionsAPIView,
    InventoryRowsAPIView,
    KidGreenImportAPIView,
    KidGreenImportJobStatusAPIView,
    KidsBulkUpdateAPIView,
    KidCompositeUpdateAPIView,
    KidDetailViewAPIView,
    KidListCreateAPIView,
    KidEanSummaryAPIView,
    KidMarketplaceEansAPIView,
    KidOrderIDsAPIView,
    DevBackendSessionSyncAPIView,
    MarketplaceHoodHealthAPIView,
    MarketplaceKauflandHealthAPIView,
    MarketplaceEanMappingConfirmAPIView,
    ServiceHealthAPIView,
    ServiceReadyAPIView,
    KidRetrieveUpdateAPIView,
    OrderListCreateAPIView,
    OrderRetrieveUpdateAPIView,
    UploadImagesToFtpAPIView,
)
from database.views_dectivate import (
    MarketplaceDeactivateByKidAPIView,
    MarketplaceHoodDeactivateByKidAPIView,
    MarketplaceJVDeactivateSofortByKidAPIView,
    MarketplaceKauflandToggleByKidAPIView,
    MarketplaceLocalStatusesByKidAPIView,
    MarketplaceXLDeactivateByKidAPIView,
)
from orders_pars.views import (
    AfterbuyItemSearchAPIView,
    AfterbuyItemSearchWebAPIView,
    CreateItemOrders,
)
from hood_service.views import HoodFetchByEANAPIView
from otto_service.views import (
    OttoProductListAPIView,
    OttoProductRetrieveAPIView,
    OttoProductUpsertAPIView,
)
from jv_services.split_views import (
    JVBatchApplyByArtikelnrAPIView,
    JVBatchApplyByEANAPIView,
    JVBatchJobStatusAPIView,
    JVBatchPlanByArtikelnrAPIView,
    JVBatchPlanByEANAPIView,
    JVDeliveryOptionsAPIView,
    JVLocalProductByArtikelnrAPIView,
    JVLocalProductByEANAPIView,
    JVProductByArtikelnrAPIView,
    JVProductByEANAPIView,
    JVProductCreateAndPushAPIView,
    JVProductCreateJobEnqueueAPIView,
    JVProductSyncByArtikelnrAPIView,
    JVProductSyncByEANAPIView,
    JVProductUpdateByArtikelnrAPIView,
    JVProductUpdateByEANAPIView,
    JVRubricsTreeAPIView,
    JVSitesByArtikelnrAPIView,
    JVSitesByEANAPIView,
)
from xl_services.views import (
    XLBatchApplyByEANAPIView,
    XLBatchPlanByEANAPIView,
    XLDeliveryOptionsAPIView,
    XLLocalProductByEANAPIView,
    XLManufacturersAPIView,
    XLProductByEANAPIView,
    XLProductCreateAndPushAPIView,
    XLProductSyncByEANAPIView,
    XLProductUpdateByEANAPIView,
    XLRubricsTreeAPIView,
    XLSitesByEANAPIView,
)
from kaufland.views import (
    ActivateProductByEANAPIView,
    ChangeProductByEANAPIView,
    CreateProductByEANAPIView,
    DeactivateProductByEANAPIView,
    DeleteProductByEANAPIView,
    GetProductAPIView,
    KauflandImageProxyAPIView,
)
from database_service.openapi_schema import generate_openapi_document
from telegram_service.config import load_telegram_runtime_config
from telegram_service.views import (
    TelegramAccessApproveAPIView,
    TelegramAccessDeleteAPIView,
    TelegramAccessListAPIView,
    TelegramAccessRevokeAPIView,
    TelegramWebhookAPIView,
)


_telegram_runtime_config = load_telegram_runtime_config()


def _telegram_webhook_route_paths() -> list[str]:
    canonical = "/api/v1/telegram/webhook/"
    configured = _telegram_runtime_config.webhook_path
    candidates = [canonical, configured]
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_path in candidates:
        trimmed = "/" + str(raw_path or "").strip().strip("/") + "/"
        for variant in (trimmed, trimmed.rstrip("/")):
            route_path = variant.lstrip("/")
            if not route_path or route_path in seen:
                continue
            seen.add(route_path)
            normalized.append(route_path)
    return normalized

api_v1_patterns = [
    path("api/v1/healthz", ServiceHealthAPIView.as_view(), name="service-health-v1-noslash"),
    path("api/v1/healthz/", ServiceHealthAPIView.as_view(), name="service-health-v1"),
    path("api/v1/readyz", ServiceReadyAPIView.as_view(), name="service-ready-v1-noslash"),
    path("api/v1/readyz/", ServiceReadyAPIView.as_view(), name="service-ready-v1"),
    path("api/v1/dev/session/sync/", DevBackendSessionSyncAPIView.as_view(), name="dev-backend-session-sync-v1"),
    path("api/v1/kids/", KidListCreateAPIView.as_view(), name="kid-list-create-v1"),
    path("api/v1/kids/<int:pk>/", KidRetrieveUpdateAPIView.as_view(), name="kid-detail-v1"),
    path("api/v1/kids/<int:pk>/detail-view/", KidDetailViewAPIView.as_view(), name="kid-detail-view-v1"),
    path("api/v1/kids/<int:pk>/composite-update/", KidCompositeUpdateAPIView.as_view(), name="kid-composite-update-v1"),
    path("api/v1/kids/bulk-update/", KidsBulkUpdateAPIView.as_view(), name="kids-bulk-update-v1"),
    path("api/v1/orders/", OrderListCreateAPIView.as_view(), name="order-list-create-v1"),
    path("api/v1/orders/<int:pk>/", OrderRetrieveUpdateAPIView.as_view(), name="order-detail-v1"),
    path("api/v1/marketplace/deactivate-by-kid/", MarketplaceDeactivateByKidAPIView.as_view(), name="marketplace-deactivate-by-kid-v1"),
    path("api/v1/marketplace/jv/deactivate-sofort-by-kid/", MarketplaceJVDeactivateSofortByKidAPIView.as_view(), name="marketplace-jv-deactivate-sofort-by-kid-v1"),
    path("api/v1/marketplace/xl/deactivate-by-kid/", MarketplaceXLDeactivateByKidAPIView.as_view(), name="marketplace-xl-deactivate-by-kid-v1"),
    path("api/v1/marketplace/hood/deactivate-by-kid/", MarketplaceHoodDeactivateByKidAPIView.as_view(), name="marketplace-hood-deactivate-by-kid-v1"),
    path("api/v1/marketplace/kaufland/toggle-by-kid/", MarketplaceKauflandToggleByKidAPIView.as_view(), name="marketplace-kaufland-toggle-by-kid-v1"),
    path("api/v1/marketplace/local-statuses-by-kid/", MarketplaceLocalStatusesByKidAPIView.as_view(), name="marketplace-local-statuses-by-kid-v1"),
    path("api/v1/marketplace/ean-mappings/confirm/", MarketplaceEanMappingConfirmAPIView.as_view(), name="marketplace-ean-mapping-confirm-v1"),
    path("api/v1/inventory/rows/", InventoryRowsAPIView.as_view(), name="inventory-rows-v1"),
    path("api/v1/inventory/dashboard-summary/", InventoryDashboardSummaryAPIView.as_view(), name="inventory-dashboard-summary-v1"),
    path("api/v1/inventory/critical/", CriticalInventoryAPIView.as_view(), name="inventory-critical-v1"),
    path("api/v1/inventory/change-history/", InventoryChangeHistoryAPIView.as_view(), name="inventory-change-history-v1"),
    path("api/v1/inventory/filter-options/", InventoryFilterOptionsAPIView.as_view(), name="inventory-filter-options-v1"),
    path("api/v1/kids/import-kid-green/", KidGreenImportAPIView.as_view(), name="kid-green-import-v1"),
    path("api/v1/kids/import-kid-green/jobs/<str:job_id>/", KidGreenImportJobStatusAPIView.as_view(), name="kid-green-import-job-status-v1"),
    path("api/v1/ean-pool/import/", EANPoolImportAPIView.as_view(), name="ean-pool-import-v1"),
    path("api/v1/ean-pool/stats/", EANPoolStatsAPIView.as_view(), name="ean-pool-stats-v1"),
    path("api/v1/ean-pool/take-next-free/", EANPoolTakeNextFreeAPIView.as_view(), name="ean-pool-take-next-free-v1"),
    path("api/v1/ean-pool/claim-for-job/", EANPoolClaimForJobAPIView.as_view(), name="ean-pool-claim-for-job-v1"),
    path("api/v1/ean-pool/mark-job-used/", EANPoolMarkJobUsedAPIView.as_view(), name="ean-pool-mark-job-used-v1"),
    path("api/v1/ean-pool/reserve/", EANPoolReserveAPIView.as_view(), name="ean-pool-reserve-v1"),
    path("api/v1/ean-pool/mark-used/", EANPoolMarkUsedAPIView.as_view(), name="ean-pool-mark-used-v1"),
    path("api/v1/ean-pool/<str:ean>/usage/", EANPoolUsageByEANAPIView.as_view(), name="ean-pool-usage-v1"),
    path("api/v1/uploads/images/", UploadImagesToFtpAPIView.as_view(), name="uploads-images-v1"),
    path(
        "api/v1/kids/<int:kid_id>/order-ids/",
        KidOrderIDsAPIView.as_view(),
        name="kid-order-ids-v1",
    ),
    path(
        "api/v1/kids/<int:kid_id>/ean-summary/",
        KidEanSummaryAPIView.as_view(),
        name="kid-ean-summary-v1",
    ),
    path(
        "api/v1/kids/<int:kid_id>/marketplace-eans/",
        KidMarketplaceEansAPIView.as_view(),
        name="kid-marketplace-eans-v1",
    ),
    path(
        "api/v1/afterbuy/items/search/",
        AfterbuyItemSearchAPIView.as_view(),
        name="afterbuy-item-search-v1",
    ),
    path(
        "api/v1/afterbuy/items/search-web/",
        AfterbuyItemSearchWebAPIView.as_view(),
        name="afterbuy-item-search-web-v1",
    ),
    path(
        "api/v1/afterbuy/orders/create/",
        CreateItemOrders.as_view(),
        name="afterbuy-order-create-by-kundennummer-v1",
    ),
    path(
        "api/v1/kaufland/products/ean/change/",
        ChangeProductByEANAPIView.as_view(),
        name="kaufland-change-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/products/delete/",
        DeleteProductByEANAPIView.as_view(),
        name="kaufland-delete-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/products/create/",
        CreateProductByEANAPIView.as_view(),
        name="kaufland-create-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/products/deactivate/<str:ean>/",
        DeactivateProductByEANAPIView.as_view(),
        name="kaufland-deactivate-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/products/activate/<str:ean>/",
        ActivateProductByEANAPIView.as_view(),
        name="kaufland-activate-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/<str:ean>/<str:site>/",
        GetProductAPIView.as_view(),
        name="kaufland-get-product-by-ean-v1",
    ),
    path(
        "api/v1/kaufland/image-proxy/",
        KauflandImageProxyAPIView.as_view(),
        name="kaufland-image-proxy-v1",
    ),
    path(
        "api/v1/marketplace/kaufland/health/",
        MarketplaceKauflandHealthAPIView.as_view(),
        name="marketplace-kaufland-health-v1",
    ),
    path(
        "api/v1/marketplace/hood/health/",
        MarketplaceHoodHealthAPIView.as_view(),
        name="marketplace-hood-health-v1",
    ),
    path(
        "api/v1/hood/items/by-ean/<str:ean>/",
        HoodFetchByEANAPIView.as_view(),
        name="hood-fetch-by-ean-v1",
    ),
    path(
        "api/v1/otto/products/upsert/",
        OttoProductUpsertAPIView.as_view(),
        name="otto-products-upsert-v1",
    ),
    path(
        "api/v1/otto/<str:profile>/products/upsert/",
        OttoProductUpsertAPIView.as_view(),
        name="otto-products-upsert-by-profile-v1",
    ),
    path(
        "api/v1/otto/products/",
        OttoProductListAPIView.as_view(),
        name="otto-products-list-v1",
    ),
    path(
        "api/v1/otto/<str:profile>/products/",
        OttoProductListAPIView.as_view(),
        name="otto-products-list-by-profile-v1",
    ),
    path(
        "api/v1/otto/products/<int:pk>/",
        OttoProductRetrieveAPIView.as_view(),
        name="otto-products-detail-v1",
    ),
    path(
        "api/v1/otto/<str:profile>/products/<int:pk>/",
        OttoProductRetrieveAPIView.as_view(),
        name="otto-products-detail-by-profile-v1",
    ),
    path("api/v1/xl/products/by-ean/<str:ean>/", XLProductByEANAPIView.as_view(), name="xl-product-by-ean-v1"),
    path("api/v1/jv/products/by-ean/<str:ean>/", JVProductByEANAPIView.as_view(), name="jv-product-by-ean-v1"),
    path("api/v1/jv/products/by-artikelnr/<str:ean>/", JVProductByArtikelnrAPIView.as_view(), name="jv-product-by-artikelnr-v1"),
    path("api/v1/xl/sites/by-ean/<str:ean>/", XLSitesByEANAPIView.as_view(), name="xl-sites-by-ean-v1"),
    path("api/v1/jv/sites/by-ean/<str:ean>/", JVSitesByEANAPIView.as_view(), name="jv-sites-by-ean-v1"),
    path("api/v1/jv/sites/by-artikelnr/<str:ean>/", JVSitesByArtikelnrAPIView.as_view(), name="jv-sites-by-artikelnr-v1"),
    path("api/v1/xl/rubrics/tree/", XLRubricsTreeAPIView.as_view(), name="xl-rubrics-tree-v1"),
    path("api/v1/jv/rubrics/tree/", JVRubricsTreeAPIView.as_view(), name="jv-rubrics-tree-v1"),
    path("api/v1/xl/delivery-options/", XLDeliveryOptionsAPIView.as_view(), name="xl-delivery-options-v1"),
    path("api/v1/xl/manufacturers/", XLManufacturersAPIView.as_view(), name="xl-manufacturers-v1"),
    path("api/v1/jv/delivery-options/", JVDeliveryOptionsAPIView.as_view(), name="jv-delivery-options-v1"),
    path(
        "api/v1/xl/products/create-and-push/",
        XLProductCreateAndPushAPIView.as_view(),
        name="xl-product-create-and-push-v1",
    ),
    path(
        "api/v1/jv/products/create-and-push/",
        JVProductCreateAndPushAPIView.as_view(),
        name="jv-product-create-and-push-v1",
    ),
    path(
        "api/v1/xl/products/local-by-ean/<str:ean>/",
        XLLocalProductByEANAPIView.as_view(),
        name="xl-product-local-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/local-by-ean/<str:ean>/",
        JVLocalProductByEANAPIView.as_view(),
        name="jv-product-local-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/local-by-artikelnr/<str:ean>/",
        JVLocalProductByArtikelnrAPIView.as_view(),
        name="jv-product-local-by-artikelnr-v1",
    ),
    path(
        "api/v1/xl/products/update-by-ean/<str:ean>/",
        XLProductUpdateByEANAPIView.as_view(),
        name="xl-product-update-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/update-by-ean/<str:ean>/",
        JVProductUpdateByEANAPIView.as_view(),
        name="jv-product-update-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/update-by-artikelnr/<str:ean>/",
        JVProductUpdateByArtikelnrAPIView.as_view(),
        name="jv-product-update-by-artikelnr-v1",
    ),
    path(
        "api/v1/xl/products/sync-by-ean/<str:ean>/",
        XLProductSyncByEANAPIView.as_view(),
        name="xl-product-sync-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/sync-by-ean/<str:ean>/",
        JVProductSyncByEANAPIView.as_view(),
        name="jv-product-sync-by-ean-v1",
    ),
    path(
        "api/v1/jv/products/sync-by-artikelnr/<str:ean>/",
        JVProductSyncByArtikelnrAPIView.as_view(),
        name="jv-product-sync-by-artikelnr-v1",
    ),
    path(
        "api/v1/xl/batch/update-by-ean/<str:ean>/apply/",
        XLBatchApplyByEANAPIView.as_view(),
        name="xl-batch-apply-by-ean-v1",
    ),
    path(
        "api/v1/jv/batch/update-by-ean/<str:ean>/apply/",
        JVBatchApplyByEANAPIView.as_view(),
        name="jv-batch-apply-by-ean-v1",
    ),
    path(
        "api/v1/jv/batch/update-by-artikelnr/<str:ean>/apply/",
        JVBatchApplyByArtikelnrAPIView.as_view(),
        name="jv-batch-apply-by-artikelnr-v1",
    ),
    path(
        "api/v1/xl/batch/update-by-ean/<str:ean>/plan/",
        XLBatchPlanByEANAPIView.as_view(),
        name="xl-batch-plan-by-ean-v1",
    ),
    path(
        "api/v1/jv/batch/update-by-ean/<str:ean>/plan/",
        JVBatchPlanByEANAPIView.as_view(),
        name="jv-batch-plan-by-ean-v1",
    ),
    path(
        "api/v1/jv/batch/update-by-artikelnr/<str:ean>/plan/",
        JVBatchPlanByArtikelnrAPIView.as_view(),
        name="jv-batch-plan-by-artikelnr-v1",
    ),
    path(
        "api/v1/jv/batch/jobs/<int:job_id>/",
        JVBatchJobStatusAPIView.as_view(),
        name="jv-batch-job-status-v1",
    ),
    path(
        "api/v1/jv/products/create-job/",
        JVProductCreateJobEnqueueAPIView.as_view(),
        name="jv-product-create-job-v1",
    ),
]

for index, webhook_route_path in enumerate(_telegram_webhook_route_paths()):
    api_v1_patterns.append(
        path(
            webhook_route_path,
            TelegramWebhookAPIView.as_view(),
            name="telegram-webhook-v1" if index == 0 else f"telegram-webhook-v1-alias-{index}",
        )
    )

api_v1_patterns.extend(
    [
        path("api/v1/telegram/access/", TelegramAccessListAPIView.as_view(), name="telegram-access-list-v1"),
        path(
            "api/v1/telegram/access/<int:binding_id>/approve/",
            TelegramAccessApproveAPIView.as_view(),
            name="telegram-access-approve-v1",
        ),
        path(
            "api/v1/telegram/access/<int:binding_id>/revoke/",
            TelegramAccessRevokeAPIView.as_view(),
            name="telegram-access-revoke-v1",
        ),
        path(
            "api/v1/telegram/access/<int:binding_id>/",
            TelegramAccessDeleteAPIView.as_view(),
            name="telegram-access-delete-v1",
        ),
    ]
)

class OpenApiSchemaView(APIView):
    permission_classes = [AllowAny]
    renderer_classes = [JSONOpenAPIRenderer]

    def get(self, request):
        return Response(generate_openapi_document(request=request, public=True))

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/openapi.json", OpenApiSchemaView.as_view(), name="openapi-schema-v1"),
    *api_v1_patterns,
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
