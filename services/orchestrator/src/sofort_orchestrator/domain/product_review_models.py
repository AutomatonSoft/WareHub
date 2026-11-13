from typing import Literal

from pydantic import BaseModel, Field


class ReviewRetryReference(BaseModel):
    source_job_id: str = Field(min_length=1, max_length=128)
    target: str = Field(min_length=1, max_length=256)


class ReviewRetryInput(ReviewRetryReference):
    payload: dict


class ProductReviewItem(BaseModel):
    job_id: str
    request_id: str
    target: str
    marketplace: str
    account: str
    ean: str
    kid_id: int | None
    kid_number: str
    created_at_unix_ms: int
    state: Literal['queued', 'running', 'failed', 'rejected', 'pending', 'online', 'unknown']
    messages: list[str]
    retryable: bool
    blocked_reason: str = ''


class ProductReviewList(BaseModel):
    items: list[ProductReviewItem]
    next_offset: int | None
    status_unavailable: bool = False


class ProductReviewDraft(BaseModel):
    item: ProductReviewItem
    payload: dict
    locked_fields: list[str]
