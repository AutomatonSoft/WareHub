from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from .models import ErrorContract, JobStatus


class ProductEditorGroupId(str, Enum):
    JV = "JV"
    XL = "XL"
    HOOD = "HOOD"
    OTTO = "OTTO"
    KAUFLAND = "KAUFLAND"
    EBAY = "EBAY"


class ProductEditorTargetType(str, Enum):
    SOURCE_SITE = "source_site"
    MARKETPLACE_ACCOUNT = "marketplace_account"


class ProductEditorTargetStatus(str, Enum):
    UNKNOWN = "unknown"
    FOUND = "found"
    MISSING = "missing"
    ERROR = "error"
    PLANNED = "planned"
    UNSUPPORTED = "unsupported"
    READ_ONLY = "read_only"


class ProductEditorRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProductEditorCapability(BaseModel):
    discover: bool = False
    load: bool = False
    plan: bool = False
    apply: bool = False
    job_status: bool = False


class ProductEditorWarning(BaseModel):
    code: str
    message: str
    level: ProductEditorRiskLevel = ProductEditorRiskLevel.MEDIUM


class ProductEditorTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    group: ProductEditorGroupId
    target_type: ProductEditorTargetType
    account_family: str | None = None
    country: str | None = None
    baseline_eligible: bool = False
    auto_baseline_eligible: bool = False
    selected_by_default: bool = False
    read_only: bool = False
    planned: bool = False
    unsupported: bool = False
    status: ProductEditorTargetStatus = ProductEditorTargetStatus.UNKNOWN
    capabilities: ProductEditorCapability = Field(default_factory=ProductEditorCapability)
    warnings: list[ProductEditorWarning] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class ProductEditorGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: ProductEditorGroupId
    label: str
    description: str
    capabilities: ProductEditorCapability = Field(default_factory=ProductEditorCapability)
    read_only: bool = False
    planned: bool = False
    unsupported: bool = False
    targets: list[ProductEditorTarget] = Field(default_factory=list)


class ProductEditorDiscoverRequest(BaseModel):
    ean: str
    active_group: ProductEditorGroupId | None = None


class ProductEditorDiscoverResponse(BaseModel):
    request_id: str
    ean: str
    groups: list[ProductEditorGroup]
    recommended_baseline_target_id: str | None = None
    selected_group_id: ProductEditorGroupId
    selected_target_ids: list[str] = Field(default_factory=list)
    warnings: list[ProductEditorWarning] = Field(default_factory=list)


class ProductEditorLoadRequest(BaseModel):
    ean: str
    active_group: ProductEditorGroupId
    baseline_target_id: str | None = None


class ProductEditorLoadResponse(BaseModel):
    request_id: str
    ean: str
    active_group: ProductEditorGroupId
    baseline_target_id: str | None = None
    draft: dict = Field(default_factory=dict)
    supported: bool = False
    warnings: list[ProductEditorWarning] = Field(default_factory=list)


class ProductEditorPlanRequest(BaseModel):
    ean: str
    active_group: ProductEditorGroupId
    changed_fields: list[str] = Field(default_factory=list)
    draft: dict = Field(default_factory=dict)
    selected_target_ids: list[str] = Field(default_factory=list)


class ProductEditorPlanResponse(BaseModel):
    request_id: str
    plan_id: str
    ean: str
    active_group: ProductEditorGroupId
    targets: list[ProductEditorTarget] = Field(default_factory=list)
    changed_fields: list[str] = Field(default_factory=list)
    warnings: list[ProductEditorWarning] = Field(default_factory=list)
    risk_level: ProductEditorRiskLevel = ProductEditorRiskLevel.MEDIUM
    summary: dict = Field(default_factory=dict)


class ProductEditorApplyRequest(BaseModel):
    plan_id: str
    confirmation: bool = False


class ProductEditorApplyResponse(BaseModel):
    request_id: str
    job_id: str
    status: JobStatus
    active_group: ProductEditorGroupId
    accepted: bool = True


class ProductEditorJobResponse(BaseModel):
    request_id: str
    job_id: str
    status: JobStatus | str
    active_group: ProductEditorGroupId | None = None
    summary: dict = Field(default_factory=dict)
    targets: list[dict] = Field(default_factory=list)
    error: ErrorContract | None = None
