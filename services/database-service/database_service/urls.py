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
from rest_framework.schemas import get_schema_view
from rest_framework.renderers import JSONOpenAPIRenderer
from database.views import (
    EANPoolImportAPIView,
    EANPoolMarkUsedAPIView,
    EANPoolReserveAPIView,
    EANPoolStatsAPIView,
    EANPoolTakeNextFreeAPIView,
    EANPoolUsageByEANAPIView,
    InventoryRowsAPIView,
    KidsBulkUpdateAPIView,
    KidListCreateAPIView,
    KidEanSummaryAPIView,
    KidMarketplaceEansAPIView,
    KidOrderIDsAPIView,
    DevBackendSessionSyncAPIView,
    MarketplaceHoodHealthAPIView,
    MarketplaceKauflandHealthAPIView,
    ServiceHealthAPIView,
    KidRetrieveUpdateAPIView,
    OrderListCreateAPIView,
    OrderRetrieveUpdateAPIView,
    UploadImagesToFtpAPIView,
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
    JVBatchApplyByEANAPIView,
    JVBatchJobStatusAPIView,
    JVBatchPlanByEANAPIView,
    JVDeliveryOptionsAPIView,
    JVLocalProductByEANAPIView,
    JVProductByEANAPIView,
    JVProductCreateAndPushAPIView,
    JVProductSyncByEANAPIView,
    JVProductUpdateByEANAPIView,
    JVRubricsTreeAPIView,
    JVSitesByEANAPIView,
)
from xl_services.views import (
    XLBatchApplyByEANAPIView,
    XLBatchPlanByEANAPIView,
    XLDeliveryOptionsAPIView,
    XLLocalProductByEANAPIView,
    XLProductByEANAPIView,
    XLProductCreateAndPushAPIView,
    XLProductSyncByEANAPIView,
    XLProductUpdateByEANAPIView,
    XLRubricsTreeAPIView,
    XLSitesByEANAPIView,
)
from kaufland.views import (
    ChangeProductByEANAPIView,
    CreateProductByEANAPIView,
    DeleteProductByEANAPIView,
    GetProductAPIView
)

api_v1_patterns = [
    path("api/v1/healthz", ServiceHealthAPIView.as_view(), name="service-health-v1-noslash"),
    path("api/v1/healthz/", ServiceHealthAPIView.as_view(), name="service-health-v1"),
    path("api/v1/dev/session/sync/", DevBackendSessionSyncAPIView.as_view(), name="dev-backend-session-sync-v1"),
    path("api/v1/kids/", KidListCreateAPIView.as_view(), name="kid-list-create-v1"),
    path("api/v1/kids/<int:pk>/", KidRetrieveUpdateAPIView.as_view(), name="kid-detail-v1"),
    path("api/v1/kids/bulk-update/", KidsBulkUpdateAPIView.as_view(), name="kids-bulk-update-v1"),
    path("api/v1/orders/", OrderListCreateAPIView.as_view(), name="order-list-create-v1"),
    path("api/v1/orders/<int:pk>/", OrderRetrieveUpdateAPIView.as_view(), name="order-detail-v1"),
    path("api/v1/inventory/rows/", InventoryRowsAPIView.as_view(), name="inventory-rows-v1"),
    path("api/v1/ean-pool/import/", EANPoolImportAPIView.as_view(), name="ean-pool-import-v1"),
    path("api/v1/ean-pool/stats/", EANPoolStatsAPIView.as_view(), name="ean-pool-stats-v1"),
    path("api/v1/ean-pool/take-next-free/", EANPoolTakeNextFreeAPIView.as_view(), name="ean-pool-take-next-free-v1"),
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
        "api/v1/kaufland/<str:ean>/<str:site>/",
        GetProductAPIView.as_view(),
        name="kaufland-get-product-by-ean-v1",
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
]

schema_view = get_schema_view(
    title="Database Service API",
    description="OpenAPI schema for all registered Database Service endpoints",
    version="v1",
    renderer_classes=[JSONOpenAPIRenderer],
)

urlpatterns = [
    path("healthz", ServiceHealthAPIView.as_view(), name="service-health-noslash"),
    path("healthz/", ServiceHealthAPIView.as_view(), name="service-health"),
    path("admin/", admin.site.urls),
    path("api/v1/openapi.json", schema_view, name="openapi-schema-v1"),
    *api_v1_patterns,
    path("api/kids/", KidListCreateAPIView.as_view(), name="kid-list-create"),
    path("api/kids/<int:pk>/", KidRetrieveUpdateAPIView.as_view(), name="kid-detail"),
    path("api/kids/bulk-update/", KidsBulkUpdateAPIView.as_view(), name="kids-bulk-update"),
    path("api/orders/", OrderListCreateAPIView.as_view(), name="order-list-create"),
    path("api/orders/<int:pk>/", OrderRetrieveUpdateAPIView.as_view(), name="order-detail"),
    path("api/inventory/rows/", InventoryRowsAPIView.as_view(), name="inventory-rows"),
    path("api/ean-pool/import/", EANPoolImportAPIView.as_view(), name="ean-pool-import"),
    path("api/ean-pool/stats/", EANPoolStatsAPIView.as_view(), name="ean-pool-stats"),
    path("api/ean-pool/take-next-free/", EANPoolTakeNextFreeAPIView.as_view(), name="ean-pool-take-next-free"),
    path("api/ean-pool/reserve/", EANPoolReserveAPIView.as_view(), name="ean-pool-reserve"),
    path("api/ean-pool/mark-used/", EANPoolMarkUsedAPIView.as_view(), name="ean-pool-mark-used"),
    path("api/ean-pool/<str:ean>/usage/", EANPoolUsageByEANAPIView.as_view(), name="ean-pool-usage"),
    path("api/uploads/images/", UploadImagesToFtpAPIView.as_view(), name="uploads-images"),
    path(
        "api/marketplace/kaufland/health/",
        MarketplaceKauflandHealthAPIView.as_view(),
        name="marketplace-kaufland-health",
    ),
    path(
        "api/marketplace/kaufland/health",
        MarketplaceKauflandHealthAPIView.as_view(),
        name="marketplace-kaufland-health-noslash",
    ),
    path(
        "api/marketplace/hood/health/",
        MarketplaceHoodHealthAPIView.as_view(),
        name="marketplace-hood-health",
    ),
    path(
        "api/marketplace/hood/health",
        MarketplaceHoodHealthAPIView.as_view(),
        name="marketplace-hood-health-noslash",
    ),
    path(
        "api/afterbuy/items/search/",
        AfterbuyItemSearchAPIView.as_view(),
        name="afterbuy-item-search",
    ),
    path(
        "api/afterbuy/items/search-web/",
        AfterbuyItemSearchWebAPIView.as_view(),
        name="afterbuy-item-search-web",
    ),
    path(
        "api/afterbuy/orders/create/",
        CreateItemOrders.as_view(),
        name="afterbuy-order-create-by-kundennummer",
    ),
    path(
        "api/otto/products/upsert/",
        OttoProductUpsertAPIView.as_view(),
        name="otto-products-upsert",
    ),
    path(
        "api/otto/<str:profile>/products/upsert/",
        OttoProductUpsertAPIView.as_view(),
        name="otto-products-upsert-by-profile",
    ),
    path(
        "api/otto/products/",
        OttoProductListAPIView.as_view(),
        name="otto-products-list",
    ),
    path(
        "api/otto/<str:profile>/products/",
        OttoProductListAPIView.as_view(),
        name="otto-products-list-by-profile",
    ),
    path(
        "api/otto/products/<int:pk>/",
        OttoProductRetrieveAPIView.as_view(),
        name="otto-products-detail",
    ),
    path(
        "api/otto/<str:profile>/products/<int:pk>/",
        OttoProductRetrieveAPIView.as_view(),
        name="otto-products-detail-by-profile",
    ),
    path(
        "api/hood/items/by-ean/<str:ean>/",
        HoodFetchByEANAPIView.as_view(),
        name="hood-fetch-by-ean",
    ),
    # Split namespaces
    path("api/xl/products/by-ean/<str:ean>/", XLProductByEANAPIView.as_view(), name="xl-product-by-ean"),
    path("api/jv/products/by-ean/<str:ean>/", JVProductByEANAPIView.as_view(), name="jv-product-by-ean"),
    path("api/xl/sites/by-ean/<str:ean>/", XLSitesByEANAPIView.as_view(), name="xl-sites-by-ean"),
    path("api/jv/sites/by-ean/<str:ean>/", JVSitesByEANAPIView.as_view(), name="jv-sites-by-ean"),
    path("api/xl/rubrics/tree/", XLRubricsTreeAPIView.as_view(), name="xl-rubrics-tree"),
    path("api/jv/rubrics/tree/", JVRubricsTreeAPIView.as_view(), name="jv-rubrics-tree"),
    path("api/xl/delivery-options/", XLDeliveryOptionsAPIView.as_view(), name="xl-delivery-options"),
    path("api/jv/delivery-options/", JVDeliveryOptionsAPIView.as_view(), name="jv-delivery-options"),
    path("api/xl/products/create-and-push/", XLProductCreateAndPushAPIView.as_view(), name="xl-product-create-and-push"),
    path("api/jv/products/create-and-push/", JVProductCreateAndPushAPIView.as_view(), name="jv-product-create-and-push"),
    path("api/xl/products/local-by-ean/<str:ean>/", XLLocalProductByEANAPIView.as_view(), name="xl-product-local-by-ean"),
    path("api/jv/products/local-by-ean/<str:ean>/", JVLocalProductByEANAPIView.as_view(), name="jv-product-local-by-ean"),
    path("api/xl/products/update-by-ean/<str:ean>/", XLProductUpdateByEANAPIView.as_view(), name="xl-product-update-by-ean"),
    path("api/jv/products/update-by-ean/<str:ean>/", JVProductUpdateByEANAPIView.as_view(), name="jv-product-update-by-ean"),
    path("api/xl/products/sync-by-ean/<str:ean>/", XLProductSyncByEANAPIView.as_view(), name="xl-product-sync-by-ean"),
    path("api/jv/products/sync-by-ean/<str:ean>/", JVProductSyncByEANAPIView.as_view(), name="jv-product-sync-by-ean"),
    path("api/xl/batch/update-by-ean/<str:ean>/apply/", XLBatchApplyByEANAPIView.as_view(), name="xl-batch-apply-by-ean"),
    path("api/jv/batch/update-by-ean/<str:ean>/apply/", JVBatchApplyByEANAPIView.as_view(), name="jv-batch-apply-by-ean"),
    path("api/xl/batch/update-by-ean/<str:ean>/plan/", XLBatchPlanByEANAPIView.as_view(), name="xl-batch-plan-by-ean"),
    path("api/jv/batch/update-by-ean/<str:ean>/plan/", JVBatchPlanByEANAPIView.as_view(), name="jv-batch-plan-by-ean"),
    path("api/jv/batch/jobs/<int:job_id>/", JVBatchJobStatusAPIView.as_view(), name="jv-batch-job-status"),
    path(
        "api/kids/<int:kid_id>/order-ids/",
        KidOrderIDsAPIView.as_view(),
        name="kid-order-ids",
    ),
    path(
        "api/kids/<int:kid_id>/ean-summary/",
        KidEanSummaryAPIView.as_view(),
        name="kid-ean-summary",
    ),
    path(
        "api/kids/<int:kid_id>/marketplace-eans/",
        KidMarketplaceEansAPIView.as_view(),
        name="kid-marketplace-eans",
    ),
    path(
        "api/kaufland/products/ean/change/",
        ChangeProductByEANAPIView.as_view(),
        name="kaufland-change-product-by-ean",
    ),
    path(
        "api/kaufland/products/delete/",
        DeleteProductByEANAPIView.as_view(),
        name="kaufland-delete-product-by-ean",
    ),
    path(
        "api/kaufland/products/create/",
        CreateProductByEANAPIView.as_view(),
        name="kaufland-create-product-by-ean",
    ),
    path(
        "api/kaufland/<str:ean>/<str:site>/", GetProductAPIView.as_view(), name="get-product"
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
1
