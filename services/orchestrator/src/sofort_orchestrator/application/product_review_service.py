from __future__ import annotations

import json
import logging

from ..domain.field_registry import filtered_payload
from ..domain.models import CanonicalPayload, Marketplace, Operation, OrchestrateRequest
from ..domain.product_review_models import ProductReviewDraft, ProductReviewItem, ProductReviewList, ReviewRetryReference
from ..infra.product_review_store import ProductReviewStore

logger = logging.getLogger(__name__)
LOCKED_FIELDS = ['ean', 'sku', 'productReference', 'product_reference', 'itemNumber', 'artikelnr', 'id_offer', 'ebay_item_id', 'ebay_variation_sku', 'item_id', 'itemID', 'offerId', 'offer_id', 'source_sku', 'source_ean_field']
_LOCKED_FIELD_KEYS = frozenset(field.casefold() for field in LOCKED_FIELDS)


class ProductReviewError(ValueError):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def _safe_payload(value):
    if isinstance(value, list):
        return [_safe_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: _safe_payload(item) for key, item in value.items()
                if not any(word in key.lower() for word in ('password', 'secret', 'token', 'authorization', 'credential'))}
    return value


def _messages(value) -> list[str]:
    if isinstance(value, str):
        try:
            return _messages(json.loads(value))
        except (ValueError, TypeError):
            return [value[:800]] if value.strip() else []
    if isinstance(value, list):
        return [message for item in value[:8] for message in _messages(item)][:8]
    if isinstance(value, dict):
        nested = [value[key] for key in ('errors', 'failures', 'upstream_response', 'body') if value.get(key)]
        if nested:
            return list(dict.fromkeys(message for item in nested for message in _messages(item)))[:8]
        return [str(value[key])[:800] for key in ('title', 'detail', 'message', 'code') if value.get(key)][:4]
    return []


def _identity_fields(value, path='') -> dict:
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            field_path = f'{path}.{key}'
            if key.casefold() in _LOCKED_FIELD_KEYS:
                result[field_path] = item
            result.update(_identity_fields(item, field_path))
        return result
    if isinstance(value, list):
        return {key: item for index, value_item in enumerate(value)
                for key, item in _identity_fields(value_item, f'{path}[{index}]').items()}
    return {}


def _task_id(value, depth=0) -> str:
    if not isinstance(value, dict) or depth > 4:
        return ''
    for key in ('job_id', 'marketplace_job_id', 'processId', 'process_id'):
        if isinstance(value.get(key), str) and value[key].strip():
            return value[key].strip()
    for key in ('upstream_response', 'data', 'response', 'raw_response'):
        task = _task_id(value.get(key), depth + 1)
        if task:
            return task
    return ''


class ProductReviewService:
    def __init__(self, *, store: ProductReviewStore, gateway):
        self.store = store
        self.gateway = gateway

    def _snapshot(self, source: dict) -> tuple[dict, dict, str]:
        channel, command = source['channel'], source['command']
        payload = filtered_payload(channel.marketplace, command.payload.model_dump(exclude_none=True))
        if channel.changed_fields:
            payload = {key: value for key, value in payload.items() if key in channel.changed_fields}
        payload.update(filtered_payload(channel.marketplace, channel.overrides))
        result = next((item for item in source['result'].get('results', []) if item.get('target') == channel.target_label()), {})
        data = result.get('data') or {}
        identity = data.get('submission_identity') or {}
        mapping = data.get('marketplace_ean_mapping') or {}
        mapped = mapping.get('mapping') or {}
        if isinstance(mapped.get('mapping'), dict):
            mapped = mapped['mapping']
        ean = str(identity.get('ean') or mapped.get('ean') or '').strip()
        if not ean and channel.ean_source == 'main':
            ean = str(payload.get('ean') or source['ean']).strip()
        if ean:
            if channel.marketplace is Marketplace.OTTO:
                payload['ean'] = ean
                payload['sku'] = str(identity.get('sku') or payload.get('sku') or ean)
            elif channel.marketplace is Marketplace.HOOD:
                payload['itemNumber'] = ean
            elif channel.marketplace is Marketplace.EBAY:
                payload['sku'] = str(identity.get('sku') or ean)
            elif channel.marketplace is Marketplace.KAUFLAND:
                payload['id_offer'] = payload.get('id_offer') or ean
        return _safe_payload(payload), result, ean

    def _item(self, source: dict) -> ProductReviewItem:
        _, result, ean = self._snapshot(source)
        command, channel = source['command'], source['channel']
        state, messages = 'unknown', []
        if source['job_status'] in ('queued', 'running'):
            state = source['job_status']
        elif result.get('status') == 'failed' or source['error']:
            state, messages = 'failed', _messages(result.get('error') or source['error'])
        elif result.get('status') == 'success':
            mapping = (result.get('data') or {}).get('marketplace_ean_mapping') or {}
            confirmed = mapping.get('mapping') or {}
            if isinstance(confirmed.get('mapping'), dict):
                confirmed = confirmed['mapping']
            state = 'online' if confirmed.get('status') is True and channel.marketplace not in (Marketplace.OTTO, Marketplace.KAUFLAND) else 'pending'
            if state == 'pending' and channel.marketplace not in (Marketplace.OTTO, Marketplace.KAUFLAND):
                state, messages = 'unknown', ['The request succeeded but the local EAN mapping was not confirmed.']
        blocked = '' if ean else 'The original submitted EAN is not recorded; automatic retry is unsafe.'
        return ProductReviewItem(
            job_id=source['job_id'], request_id=source['request_id'], target=channel.target_label(),
            marketplace=channel.marketplace.value, account=channel.profile or channel.account or channel.site_key or channel.site or '',
            ean=ean, kid_id=command.kid_id, kid_number=command.kid_number or '',
            created_at_unix_ms=source['created_at_unix_ms'], state=state, messages=messages,
            retryable=bool(ean) and state in ('failed', 'rejected', 'unknown'), blocked_reason=blocked,
        )

    def _states(self, sources: list[dict], items: list[ProductReviewItem], request_id: str) -> bool:
        entries = [{'key': f'{item.job_id}:{item.target}', 'marketplace': item.marketplace, 'account': item.account, 'ean': item.ean}
                   for item in items if item.marketplace in ('otto', 'kaufland') and item.ean and item.state == 'pending']
        try:
            states = self.gateway.publication_states(entries=entries, request_id=request_id) if entries else []
            if not isinstance(states, list) or any(
                not isinstance(row, dict) or not isinstance(row.get('key'), str)
                or not isinstance(row.get('submitted_at_unix_ms'), int)
                for row in states
            ):
                raise ValueError('Invalid publication state data')
        except Exception:
            logger.warning('Product review publication states unavailable request_id=%s', request_id)
            for item in items:
                if any(entry['key'] == f'{item.job_id}:{item.target}' for entry in entries):
                    item.state = 'unknown'
                    item.retryable = False
                    item.blocked_reason = 'Publication status is unavailable. Refresh before retrying.'
            return True
        by_key = {row['key']: row for row in states}
        for source, item in zip(sources, items):
            current = by_key.get(f'{item.job_id}:{item.target}')
            if current is None or current.get('ean') != item.ean or current.get('account') != item.account:
                continue
            if current.get('submitted_at_unix_ms', 0) < source['created_at_unix_ms']:
                continue
            result = next((row for row in source['result'].get('results', []) if row.get('target') == item.target), {})
            expected_task = _task_id(result.get('data')) if item.marketplace == 'otto' else ''
            if expected_task and current.get('task_id') != expected_task:
                item.state, item.retryable = 'unknown', False
                item.blocked_reason = 'The stored publication belongs to another OTTO task. Refresh before retrying.'
                continue
            if current.get('state') == 'rejected':
                item.state, item.messages = 'rejected', _messages(current.get('errors'))
            elif current.get('state') == 'online' and current.get('online') is True:
                item.state, item.messages = 'online', []
            else:
                item.state = 'unknown' if current.get('state') == 'unknown' else 'pending'
                item.messages = _messages(current.get('errors'))
            timeout = any(isinstance(error, dict) and error.get('code') == 'otto_check_timeout' for error in (current.get('errors') or []))
            item.retryable = item.state == 'rejected' or (item.state == 'pending' and bool(item.messages)) or (item.state == 'unknown' and timeout)
        return False

    def list(self, *, limit: int, offset: int, query: str, request_id: str) -> ProductReviewList:
        sources = self.store.latest(limit=limit + 1, offset=offset, query=query)
        has_more = len(sources) > limit
        sources = sources[:limit]
        items = [self._item(source) for source in sources]
        unavailable = self._states(sources, items, request_id)
        return ProductReviewList(items=items, next_offset=offset + limit if has_more else None, status_unavailable=unavailable)

    def draft(self, *, job_id: str, target: str, request_id: str) -> ProductReviewDraft:
        source = self.store.source(job_id, target)
        if source is None:
            raise ProductReviewError('Review source was not found.', 404)
        item = self._item(source)
        self._states([source], [item], request_id)
        if not self.store.is_latest(source):
            item.retryable = False
            item.blocked_reason = 'A newer submission exists. Refresh the review list.'
        return ProductReviewDraft(item=item, payload=self._snapshot(source)[0], locked_fields=LOCKED_FIELDS)

    def prepare_retry(self, *, job_id: str, target: str, payload: dict, request_id: str) -> tuple[str, OrchestrateRequest]:
        source = self.store.source(job_id, target)
        draft = self.draft(job_id=job_id, target=target, request_id=request_id)
        if not draft.item.retryable:
            raise ProductReviewError(draft.item.blocked_reason or 'This submission is not eligible for retry.')
        if _identity_fields(draft.payload) != _identity_fields(payload):
            raise ProductReviewError('EAN, SKU and product identifiers cannot be changed during a review retry.', 400)
        channel = source['channel'].model_copy(deep=True)
        clean_payload = filtered_payload(channel.marketplace, payload)
        if clean_payload != payload or len(json.dumps(payload)) > 1_000_000:
            raise ProductReviewError('Review payload contains unsupported fields or is too large.', 400)
        operation = source['command'].operation
        if clean_payload.get('quantity') in (0, '0') or clean_payload.get('amount') in (0, '0'):
            raise ProductReviewError('A publication retry requires positive stock. Use the deactivation workflow for zero stock.', 400)
        if channel.marketplace is Marketplace.HOOD:
            try:
                found = self.gateway.fetch_hood_by_ean(ean=draft.item.ean, account=channel.account or 'jv', request_id=request_id)
            except Exception as exc:
                raise ProductReviewError('HOOD availability could not be verified. No retry was queued.', 503) from exc
            missing = found.status_code == 404 or found.body.get('status_code') == 404
            if found.body.get('external_status') == 'cached' or (not missing and not 200 <= found.status_code < 300):
                raise ProductReviewError('HOOD availability is uncertain. No retry was queued.', 409)
            found_items = found.body.get('items')
            matches = [item for item in (found_items if isinstance(found_items, list) else []) if isinstance(item, dict)
                       and str(item.get('ean') or item.get('itemNumber') or '') == draft.item.ean
                       and (item.get('item_id') or item.get('itemID'))]
            if not missing and (len(matches) != 1 or found.body.get('external_success') is False):
                raise ProductReviewError('HOOD did not return a matching item. No retry was queued.', 409)
            operation = Operation.PUBLISH if missing else Operation.UPDATE
        if channel.marketplace is Marketplace.EBAY and clean_payload.get('ebay_listing_mode') == 'legacy':
            operation = Operation.UPDATE
        channel.ean_source = 'main'
        channel.changed_fields = list(clean_payload)
        channel.overrides = clean_payload
        command = OrchestrateRequest(
            operation=operation, payload=CanonicalPayload(), channels=[channel],
            kid_id=source['command'].kid_id, kid_number=source['command'].kid_number,
            review_origin=ReviewRetryReference(source_job_id=job_id, target=target),
        )
        return draft.item.ean, command
