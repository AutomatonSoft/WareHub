from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from .routes import get_job_store, get_service
from ..application.product_review_service import ProductReviewError, ProductReviewService
from ..domain.product_review_models import ProductReviewDraft, ProductReviewList
from ..infra.product_review_gateway import ProductReviewGateway
from ..infra.product_review_store import ProductReviewStore

router = APIRouter()


def get_product_review_service() -> ProductReviewService:
    mapping = get_service().marketplace_ean_mapping_gateway
    if mapping is None:
        raise HTTPException(status_code=503, detail='Marketplace service gateway is not configured')
    return ProductReviewService(
        store=ProductReviewStore(get_job_store().db_path),
        gateway=ProductReviewGateway(base_url=mapping.base_url, http_client=mapping.http, service_auth_token=mapping.service_auth_token),
    )


@router.get('/api/v1/orchestrator/reviews', response_model=ProductReviewList)
def list_product_reviews(
    request: Request, limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0), q: str = Query(default='', max_length=128),
    service: ProductReviewService = Depends(get_product_review_service),
):
    return service.list(limit=limit, offset=offset, query=q.strip(), request_id=request.state.request_id)


@router.get('/api/v1/orchestrator/reviews/{job_id}', response_model=ProductReviewDraft)
def get_product_review(
    job_id: str, request: Request, target: str = Query(min_length=1, max_length=256),
    service: ProductReviewService = Depends(get_product_review_service),
):
    try:
        return service.draft(job_id=job_id, target=target, request_id=request.state.request_id)
    except ProductReviewError as exc:
        return JSONResponse(status_code=exc.status_code, content={'code': 'product_review_unavailable', 'message': str(exc)})
