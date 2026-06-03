from __future__ import annotations

from .product_editor_models import (
    ProductEditorCapability,
    ProductEditorGroup,
    ProductEditorGroupId,
    ProductEditorTarget,
    ProductEditorTargetStatus,
    ProductEditorTargetType,
    ProductEditorWarning,
)


_XL_SITE_KEYS = [
    "XLMOEBEL_DE",
    "XLMOEBEL_CH",
    "XLMOBILI_IT",
    "XLMEUBILAIR_NL",
    "XLMEBELES_LV",
    "XLMOEBEL_LU",
    "XLNABYTEK_CZ",
    "XLPOSLOVNO_SI",
    "XLFURNITURE_CO_UK",
    "XLBUTOROK_HU",
    "XLHOME_GR",
    "XLMEBLE_PL",
    "XLMEUBELLA_BE",
    "XLMEUBLES_FR",
    "XLMOEBEL_AT",
    "XLMUEBLES_ES",
    "XLFURNITURE_IE",
    "XLHUONEKALUT_FI",
    "XLMOBILA_RO",
    "XLMOBILIARIO_PT",
    "XLMOBLER_SE",
    "XLNABYTOK_SK",
    "XXLMOBLER_DK",
]


def _warning(code: str, message: str) -> ProductEditorWarning:
    return ProductEditorWarning(code=code, message=message)


def _target(
    *,
    id: str,
    label: str,
    group: ProductEditorGroupId,
    target_type: ProductEditorTargetType,
    account_family: str | None,
    country: str | None,
    baseline_eligible: bool = False,
    auto_baseline_eligible: bool = False,
    selected_by_default: bool = False,
    read_only: bool = False,
    planned: bool = False,
    unsupported: bool = False,
    capabilities: ProductEditorCapability | None = None,
    warnings: list[ProductEditorWarning] | None = None,
) -> ProductEditorTarget:
    status = ProductEditorTargetStatus.UNKNOWN
    if unsupported:
        status = ProductEditorTargetStatus.UNSUPPORTED
    elif planned:
        status = ProductEditorTargetStatus.PLANNED
    elif read_only:
        status = ProductEditorTargetStatus.READ_ONLY
    return ProductEditorTarget(
        id=id,
        label=label,
        group=group,
        target_type=target_type,
        account_family=account_family,
        country=country,
        baseline_eligible=baseline_eligible,
        auto_baseline_eligible=auto_baseline_eligible,
        selected_by_default=selected_by_default,
        read_only=read_only,
        planned=planned,
        unsupported=unsupported,
        status=status,
        capabilities=capabilities or ProductEditorCapability(discover=True),
        warnings=warnings or [],
    )


def build_product_editor_groups() -> list[ProductEditorGroup]:
    jv_targets = [
        _target(
            id="JV_DE",
            label="JV DE",
            group=ProductEditorGroupId.JV,
            target_type=ProductEditorTargetType.SOURCE_SITE,
            account_family="JV",
            country="DE",
            baseline_eligible=True,
            auto_baseline_eligible=True,
            selected_by_default=True,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
        ),
        _target(
            id="JV_CH",
            label="JV CH",
            group=ProductEditorGroupId.JV,
            target_type=ProductEditorTargetType.SOURCE_SITE,
            account_family="JV",
            country="CH",
            baseline_eligible=True,
            auto_baseline_eligible=True,
            selected_by_default=True,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
        ),
        _target(
            id="JV_AT",
            label="JV AT",
            group=ProductEditorGroupId.JV,
            target_type=ProductEditorTargetType.SOURCE_SITE,
            account_family="JV",
            country="AT",
            baseline_eligible=True,
            auto_baseline_eligible=True,
            selected_by_default=True,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
        ),
        _target(
            id="JV_CO_UK",
            label="JV UK",
            group=ProductEditorGroupId.JV,
            target_type=ProductEditorTargetType.SOURCE_SITE,
            account_family="JV",
            country="UK",
            baseline_eligible=True,
            auto_baseline_eligible=False,
            selected_by_default=True,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
            warnings=[_warning("product_editor_translation_required", "UK target requires translation handling.")],
        ),
    ]

    xl_targets = [
        _target(
            id=site_key,
            label=site_key,
            group=ProductEditorGroupId.XL,
            target_type=ProductEditorTargetType.SOURCE_SITE,
            account_family="XL",
            country=site_key.rsplit("_", 1)[-1],
            baseline_eligible=site_key == "XLMOEBEL_DE",
            auto_baseline_eligible=site_key == "XLMOEBEL_DE",
            read_only=True,
            planned=True,
            capabilities=ProductEditorCapability(discover=True),
            warnings=[_warning("product_editor_xl_placeholder", "XL editing is placeholder/read-only in MVP.")],
        )
        for site_key in _XL_SITE_KEYS
    ]

    hood_targets = [
        _target(
            id="HOOD_JV",
            label="Hood JV",
            group=ProductEditorGroupId.HOOD,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="JV",
            country=None,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
        ),
        _target(
            id="HOOD_XL",
            label="Hood XL",
            group=ProductEditorGroupId.HOOD,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="XL",
            country=None,
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
        ),
    ]

    otto_targets = [
        _target(
            id="OTTO_JV",
            label="Otto JV",
            group=ProductEditorGroupId.OTTO,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="JV",
            country=None,
            read_only=True,
            planned=True,
            capabilities=ProductEditorCapability(discover=True),
        ),
        _target(
            id="OTTO_XL",
            label="Otto XL",
            group=ProductEditorGroupId.OTTO,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="XL",
            country=None,
            read_only=True,
            planned=True,
            capabilities=ProductEditorCapability(discover=True),
        ),
    ]

    kaufland_targets = [
        _target(
            id="KAUFLAND_JV",
            label="Kaufland JV",
            group=ProductEditorGroupId.KAUFLAND,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="JV",
            country=None,
            read_only=True,
            planned=True,
            capabilities=ProductEditorCapability(discover=True),
        ),
        _target(
            id="KAUFLAND_XL",
            label="Kaufland XL",
            group=ProductEditorGroupId.KAUFLAND,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="XL",
            country=None,
            read_only=True,
            planned=True,
            capabilities=ProductEditorCapability(discover=True),
        ),
    ]

    ebay_targets = [
        _target(
            id="EBAY_JV",
            label="Ebay JV",
            group=ProductEditorGroupId.EBAY,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="JV",
            country=None,
            read_only=True,
            planned=True,
            unsupported=True,
            capabilities=ProductEditorCapability(discover=True),
            warnings=[_warning("product_editor_ebay_not_supported", "Ebay is unsupported in current runtime.")],
        ),
        _target(
            id="EBAY_XL",
            label="Ebay XL",
            group=ProductEditorGroupId.EBAY,
            target_type=ProductEditorTargetType.MARKETPLACE_ACCOUNT,
            account_family="XL",
            country=None,
            read_only=True,
            planned=True,
            unsupported=True,
            capabilities=ProductEditorCapability(discover=True),
            warnings=[_warning("product_editor_ebay_not_supported", "Ebay is unsupported in current runtime.")],
        ),
    ]

    return [
        ProductEditorGroup(
            id=ProductEditorGroupId.JV,
            label="JV",
            description="JVMOEBEL source sites.",
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
            targets=jv_targets,
        ),
        ProductEditorGroup(
            id=ProductEditorGroupId.XL,
            label="XL",
            description="XLMOEBEL source sites.",
            capabilities=ProductEditorCapability(discover=True),
            read_only=True,
            planned=True,
            targets=xl_targets,
        ),
        ProductEditorGroup(
            id=ProductEditorGroupId.HOOD,
            label="HOOD",
            description="Hood marketplace accounts.",
            capabilities=ProductEditorCapability(discover=True, load=True, plan=True, apply=True, job_status=True),
            targets=hood_targets,
        ),
        ProductEditorGroup(
            id=ProductEditorGroupId.OTTO,
            label="OTTO",
            description="Otto marketplace accounts.",
            capabilities=ProductEditorCapability(discover=True),
            read_only=True,
            planned=True,
            targets=otto_targets,
        ),
        ProductEditorGroup(
            id=ProductEditorGroupId.KAUFLAND,
            label="KAUFLAND",
            description="Kaufland marketplace accounts.",
            capabilities=ProductEditorCapability(discover=True),
            read_only=True,
            planned=True,
            targets=kaufland_targets,
        ),
        ProductEditorGroup(
            id=ProductEditorGroupId.EBAY,
            label="EBAY",
            description="Ebay marketplace accounts.",
            capabilities=ProductEditorCapability(discover=True),
            read_only=True,
            planned=True,
            unsupported=True,
            targets=ebay_targets,
        ),
    ]
