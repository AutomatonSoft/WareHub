"""Legacy compatibility shim for old import path `jv_services.views`.

All active implementations are split across:
- jv_services.views_read
- jv_services.views_write
- jv_services.views_batch
"""

from .views_read import (
    JVDeliveryOptionsAPIView,
    JVLocalProductByEANAPIView,
    JVProductByEANAPIView,
    JVSitesByEANAPIView,
    JVRubricsTreeAPIView,
)
from .split_views import (
    JVBatchApplyByArtikelnrAPIView,
    JVBatchPlanByArtikelnrAPIView,
    JVLocalProductByArtikelnrAPIView,
    JVProductByArtikelnrAPIView,
    JVProductSyncByArtikelnrAPIView,
    JVProductUpdateByArtikelnrAPIView,
    JVSitesByArtikelnrAPIView,
)
from .views_write import (
    JVProductCreateAndPushAPIView,
    JVProductCreateAPIView,
    JVProductCreateByEANAPIView,
    JVProductUpdateByEANAPIView,
)
from .views_batch import (
    JVBatchApplyByEANAPIView,
    JVBatchJobStatusAPIView,
    JVBatchPlanByEANAPIView,
)

__all__ = [
    "JVBatchApplyByEANAPIView",
    "JVBatchApplyByArtikelnrAPIView",
    "JVBatchJobStatusAPIView",
    "JVBatchPlanByEANAPIView",
    "JVBatchPlanByArtikelnrAPIView",
    "JVDeliveryOptionsAPIView",
    "JVLocalProductByEANAPIView",
    "JVLocalProductByArtikelnrAPIView",
    "JVProductByEANAPIView",
    "JVProductByArtikelnrAPIView",
    "JVProductCreateAndPushAPIView",
    "JVProductCreateAPIView",
    "JVProductCreateByEANAPIView",
    "JVProductUpdateByEANAPIView",
    "JVProductSyncByArtikelnrAPIView",
    "JVProductUpdateByArtikelnrAPIView",
    "JVSitesByEANAPIView",
    "JVSitesByArtikelnrAPIView",
    "JVRubricsTreeAPIView",
]
