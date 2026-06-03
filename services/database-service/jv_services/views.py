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
    "JVBatchJobStatusAPIView",
    "JVBatchPlanByEANAPIView",
    "JVDeliveryOptionsAPIView",
    "JVLocalProductByEANAPIView",
    "JVProductByEANAPIView",
    "JVProductCreateAndPushAPIView",
    "JVProductCreateAPIView",
    "JVProductCreateByEANAPIView",
    "JVProductUpdateByEANAPIView",
    "JVSitesByEANAPIView",
    "JVRubricsTreeAPIView",
]
