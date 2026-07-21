from __future__ import annotations

from .models import ImportedProduct
from .views_read import (
    JVDeliveryOptionsAPIView as _BaseJVDeliveryOptionsAPIView,
    JVRubricsTreeAPIView as _BaseJVRubricsTreeAPIView,
    JVLocalProductByEANAPIView as _BaseJVLocalProductByEANAPIView,
    JVProductByEANAPIView as _BaseJVProductByEANAPIView,
    JVSitesByEANAPIView as _BaseJVSitesByEANAPIView,
)
from .views_batch import (
    JVBatchApplyByEANAPIView as _BaseJVBatchApplyByEANAPIView,
    JVBatchJobStatusAPIView as _BaseJVBatchJobStatusAPIView,
    JVBatchPlanByEANAPIView as _BaseJVBatchPlanByEANAPIView,
    JVProductCreateJobEnqueueAPIView as _BaseJVProductCreateJobEnqueueAPIView,
)
from .views_write import (
    JVProductCreateAndPushAPIView as _BaseJVProductCreateAndPushAPIView,
    JVProductCreateByEANAPIView as _BaseJVProductCreateByEANAPIView,
    JVProductUpdateByEANAPIView as _BaseJVProductUpdateByEANAPIView,
)
class _ForcedSiteMixin:
    forced_site: str = ""

    def dispatch(self, request, *args, **kwargs):
        # Force JV site family by namespace.
        if self.forced_site:
            query = request.GET.copy()
            query["site"] = self.forced_site
            request.GET = query
        return super().dispatch(request, *args, **kwargs)

class JVProductByEANAPIView(_ForcedSiteMixin, _BaseJVProductByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVProductByArtikelnrAPIView(JVProductByEANAPIView):
    pass


class JVSitesByEANAPIView(_ForcedSiteMixin, _BaseJVSitesByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVSitesByArtikelnrAPIView(JVSitesByEANAPIView):
    pass


class JVRubricsTreeAPIView(_ForcedSiteMixin, _BaseJVRubricsTreeAPIView):
    forced_site = ImportedProduct.Site.JV

class JVDeliveryOptionsAPIView(_ForcedSiteMixin, _BaseJVDeliveryOptionsAPIView):
    forced_site = ImportedProduct.Site.JV

class JVProductCreateAndPushAPIView(_ForcedSiteMixin, _BaseJVProductCreateAndPushAPIView):
    forced_site = ImportedProduct.Site.JV

class JVLocalProductByEANAPIView(_ForcedSiteMixin, _BaseJVLocalProductByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVLocalProductByArtikelnrAPIView(JVLocalProductByEANAPIView):
    pass


class JVProductUpdateByEANAPIView(_ForcedSiteMixin, _BaseJVProductUpdateByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVProductUpdateByArtikelnrAPIView(JVProductUpdateByEANAPIView):
    pass


class JVProductSyncByEANAPIView(_ForcedSiteMixin, _BaseJVProductCreateByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVProductSyncByArtikelnrAPIView(JVProductSyncByEANAPIView):
    pass


class JVBatchApplyByEANAPIView(_ForcedSiteMixin, _BaseJVBatchApplyByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVBatchApplyByArtikelnrAPIView(JVBatchApplyByEANAPIView):
    pass


class JVBatchPlanByEANAPIView(_ForcedSiteMixin, _BaseJVBatchPlanByEANAPIView):
    forced_site = ImportedProduct.Site.JV


class JVBatchPlanByArtikelnrAPIView(JVBatchPlanByEANAPIView):
    pass


class JVBatchJobStatusAPIView(_ForcedSiteMixin, _BaseJVBatchJobStatusAPIView):
    forced_site = ImportedProduct.Site.JV

class JVProductCreateJobEnqueueAPIView(_ForcedSiteMixin, _BaseJVProductCreateJobEnqueueAPIView):
    forced_site = ImportedProduct.Site.JV
