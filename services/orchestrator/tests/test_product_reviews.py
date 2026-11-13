import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.sofort_orchestrator.api import product_review_routes, routes
from src.sofort_orchestrator.application.product_review_service import ProductReviewError, ProductReviewService
from src.sofort_orchestrator.domain.models import ChannelTarget, CreateJobRequest, JobStatus, Marketplace, Operation, OrchestrateRequest, OrchestrateResponse, ChannelResult, ErrorContract
from src.sofort_orchestrator.infra.idempotency import SqliteIdempotencyStore
from src.sofort_orchestrator.infra.job_store import SqliteJobStore
from src.sofort_orchestrator.infra.product_review_store import ProductReviewStore
from src.sofort_orchestrator.main import app

EAN = '4071489368673'


class Gateway:
    def __init__(self):
        self.states = []
        self.hood = SimpleNamespace(status_code=404, body={})
        self.unavailable = False

    def publication_states(self, **kwargs):
        if self.unavailable:
            raise RuntimeError('offline')
        return self.states

    def fetch_hood_by_ean(self, **kwargs):
        return self.hood


@pytest.fixture
def review(tmp_path):
    jobs = SqliteJobStore(str(tmp_path / 'jobs.sqlite3'))
    gateway = Gateway()
    service = ProductReviewService(store=ProductReviewStore(jobs.db_path), gateway=gateway)
    return jobs, gateway, service


def source(jobs, marketplace='otto', account='jv', *, kid_id=1, status='failed', operation='publish', pool=False, identity=True, payload=None):
    channel = ChannelTarget(marketplace=marketplace, **({'profile': account} if marketplace == 'otto' else {'site': 'JV', 'site_key': 'JV_DE'} if marketplace == 'xljv' else {'account': account}), ean_source='pool' if pool else 'main')
    payload = payload or {'title': 'Product', 'price': '99', 'productReference': 'stable-reference', 'sku': EAN, 'ean': EAN, 'source_model': 'Product'}
    command = OrchestrateRequest(operation=operation, payload=payload, channels=[channel], kid_id=kid_id, kid_number=str(kid_id))
    job_id = str(uuid.uuid4())
    jobs.create_job(job_id=job_id, request_id=job_id, ean=EAN, command=command)
    result = ChannelResult(marketplace=marketplace, target=channel.target_label(), status=status, status_code=422 if status == 'failed' else 202,
                           data={'submission_identity': {'ean': EAN, 'sku': EAN}} if identity else {},
                           error=ErrorContract(code='bad_attribute', message='Invalid color', request_id=job_id) if status == 'failed' else None)
    jobs.mark_completed(job_id=job_id, result=OrchestrateResponse(request_id=job_id, status='failed' if status == 'failed' else 'success', results=[result]))
    return job_id, channel.target_label()


@pytest.mark.parametrize('marketplace,account', [('otto', 'jv'), ('otto', 'xl'), ('hood', 'jv'), ('hood', 'xl'), ('kaufland', 'jv'), ('kaufland', 'xl'), ('ebay', 'jv'), ('ebay', 'xl'), ('ebay', 'dep'), ('xljv', 'jv')])
def test_each_supported_destination_loads_a_snapshot_and_retries_without_new_identifiers(review, marketplace, account):
    jobs, _, service = review
    job_id, target = source(jobs, marketplace, account, pool=marketplace in ('hood', 'kaufland', 'ebay'))
    loaded = service.draft(job_id=job_id, target=target, request_id='read')
    edited = {**loaded.payload, 'price': '120'} if marketplace != 'otto' else {**loaded.payload, 'pricing': {'standardPrice': {'amount': 120, 'currency': 'EUR'}}}
    ean, command = service.prepare_retry(job_id=job_id, target=target, payload=edited, request_id='retry')
    assert ean == EAN
    assert len(command.channels) == 1
    assert command.channels[0].target_label() == target
    assert command.channels[0].ean_source == 'main'
    assert command.channels[0].overrides == edited
    assert command.review_origin.source_job_id == job_id
    if marketplace == 'otto':
        assert edited['productReference'] == 'stable-reference'
        assert edited['sku'] == EAN


def test_latest_attempt_per_kid_and_account_supersedes_old_rejection(review):
    jobs, _, service = review
    old, target = source(jobs)
    new, _ = source(jobs, status='success')
    other, _ = source(jobs, account='xl')
    items = service.list(limit=50, offset=0, query='', request_id='read').items
    assert {item.job_id for item in items} == {new, other}
    assert not service.draft(job_id=old, target=target, request_id='read').item.retryable


def test_pagination_and_search_do_not_drop_other_products(review):
    jobs, _, service = review
    source(jobs, kid_id=1)
    source(jobs, kid_id=2)
    page = service.list(limit=1, offset=0, query='', request_id='read')
    assert page.next_offset == 1
    assert len(service.list(limit=1, offset=1, query='', request_id='read').items) == 1
    assert len(service.list(limit=50, offset=0, query=EAN, request_id='read').items) == 2


def test_rejection_arriving_after_http_acceptance_is_visible_and_retryable(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    gateway.states = [{'key': f'{job_id}:{target}', 'ean': EAN, 'account': 'jv', 'submitted_at_unix_ms': 9999999999999,
                       'state': 'rejected', 'online': False, 'errors': [{'code': '100006', 'title': 'Invalid Grundfarbe'}]}]
    item = service.list(limit=50, offset=0, query='', request_id='read').items[0]
    assert item.state == 'rejected' and item.retryable
    assert 'Invalid Grundfarbe' in item.messages
    gateway.states[0].update(state='online', online=True, errors=[])
    assert service.list(limit=50, offset=0, query='', request_id='read').items[0].state == 'online'


def test_status_outage_is_not_publication_success_or_an_automatic_retry(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    gateway.unavailable = True
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    assert draft.item.state == 'unknown'
    assert not draft.item.retryable


def test_old_status_and_another_account_cannot_confirm_current_submission(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    gateway.states = [{'key': f'{job_id}:{target}', 'ean': EAN, 'account': 'jv', 'submitted_at_unix_ms': 0, 'state': 'online', 'online': True}]
    assert service.draft(job_id=job_id, target=target, request_id='read').item.state == 'pending'
    gateway.states[0].update(account='xl', submitted_at_unix_ms=9999999999999)
    assert service.draft(job_id=job_id, target=target, request_id='read').item.state == 'pending'


def test_missing_historical_pool_identity_is_blocked_instead_of_allocating_a_new_ean(review):
    jobs, _, service = review
    job_id, target = source(jobs, 'hood', pool=True, identity=False)
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    assert not draft.item.retryable
    with pytest.raises(ProductReviewError):
        service.prepare_retry(job_id=job_id, target=target, payload=draft.payload, request_id='retry')


def test_existing_hood_item_is_updated_and_ambiguous_availability_is_blocked(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, 'hood', pool=True)
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    gateway.hood = SimpleNamespace(status_code=200, body={'items': [{'itemID': '123', 'ean': EAN}]})
    assert service.prepare_retry(job_id=job_id, target=target, payload=draft.payload, request_id='retry')[1].operation is Operation.UPDATE
    gateway.hood = SimpleNamespace(status_code=200, body={'external_status': 'cached', 'items': [{'itemID': '123'}]})
    with pytest.raises(ProductReviewError):
        service.prepare_retry(job_id=job_id, target=target, payload=draft.payload, request_id='retry')


def test_product_identifiers_are_immutable_but_attributes_can_be_edited(review):
    jobs, _, service = review
    job_id, target = source(jobs)
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    for key in ('ean', 'sku', 'productReference'):
        with pytest.raises(ProductReviewError):
            service.prepare_retry(job_id=job_id, target=target, payload={**draft.payload, key: 'different'}, request_id='retry')


def test_retry_enqueue_is_atomic_across_double_clicks_and_keeps_original_history(review):
    jobs, _, service = review
    job_id, target = source(jobs)
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    ean, command = service.prepare_retry(job_id=job_id, target=target, payload=draft.payload, request_id='retry')
    def enqueue(_):
        try:
            jobs.create_job(job_id=str(uuid.uuid4()), request_id='retry', ean=ean, command=command)
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(enqueue, range(2))) == [False, True]
    assert jobs.get_job(job_id=job_id).status is JobStatus.COMPLETED


def test_api_uses_verified_actor_and_replays_one_retry_job(review, monkeypatch, tmp_path):
    jobs, _, service = review
    job_id, target = source(jobs)
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    original_factory = product_review_routes.get_product_review_service
    monkeypatch.setattr(product_review_routes, 'get_product_review_service', lambda: service)
    monkeypatch.setattr(routes.Deps, 'job_store', jobs)
    monkeypatch.setattr(routes.Deps, 'idempotency_store', SqliteIdempotencyStore(str(tmp_path / 'idempotency.sqlite3'), ttl_seconds=3600))
    app.dependency_overrides[original_factory] = lambda: service
    try:
        client = TestClient(app)
        assert client.get('/api/v1/orchestrator/reviews').status_code == 200
        body = {'ean': EAN, 'command': {'payload': {}, 'channels': [], 'actor_login': 'forged'}, 'review': {'source_job_id': job_id, 'target': target, 'payload': draft.payload}}
        headers = {'Idempotency-Key': 'same-retry', 'X-Warehub-Actor-Login': 'verified', 'X-Warehub-Actor-Name': 'Verified user'}
        first = client.post('/api/v1/orchestrator/jobs', json=body, headers=headers)
        again = client.post('/api/v1/orchestrator/jobs', json=body, headers=headers)
        assert first.status_code == 200, first.text
        assert first.json()['job_id'] == again.json()['job_id']
        queued = jobs.get_job_command(job_id=first.json()['job_id'])
        assert queued.actor_login == 'verified'
        assert queued.kid_id == 1
        assert len(queued.channels) == 1
        forged = {'ean': EAN, 'command': {'payload': {}, 'channels': [], 'review_origin': {'source_job_id': job_id, 'target': target}}}
        assert client.post('/api/v1/orchestrator/jobs', json=forged, headers=headers).status_code == 400
        assert client.post('/api/v1/orchestrator/jobs/batch', json={'items': [forged]}, headers=headers).status_code == 400
        assert client.post(f'/api/v1/orchestrator/products/{EAN}/update', json=forged['command'], headers=headers).status_code == 400
    finally:
        app.dependency_overrides.pop(original_factory, None)


def test_legacy_idempotency_hash_excludes_new_optional_review_fields():
    body = CreateJobRequest(ean=EAN, command=OrchestrateRequest(payload={}, channels=[]))
    assert 'review' not in routes._replay_payload(body)
    assert 'review_origin' not in routes._replay_payload(body)['command']


def test_old_online_flag_does_not_confirm_a_pending_edit(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    gateway.states = [{'key': f'{job_id}:{target}', 'ean': EAN, 'account': 'jv', 'submitted_at_unix_ms': 9999999999999, 'state': 'pending', 'online': True}]
    item = service.draft(job_id=job_id, target=target, request_id='read').item
    assert item.state == 'pending' and not item.retryable


def test_kaufland_validation_issues_are_retryable_but_normal_moderation_is_not(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, marketplace='kaufland', status='success')
    gateway.states = [{'key': f'{job_id}:{target}', 'ean': EAN, 'account': 'jv', 'submitted_at_unix_ms': 9999999999999, 'state': 'pending', 'online': False, 'errors': []}]
    assert not service.draft(job_id=job_id, target=target, request_id='read').item.retryable
    gateway.states[0]['errors'] = [{'title': 'Main image is missing'}]
    assert service.draft(job_id=job_id, target=target, request_id='read').item.retryable


def test_malformed_status_data_blocks_retry_without_claiming_success(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    gateway.states = [{'key': 'wrong', 'submitted_at_unix_ms': None}]
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    assert draft.item.state == 'unknown' and not draft.item.retryable


def test_another_otto_task_cannot_confirm_or_reject_the_edited_submission(review):
    jobs, gateway, service = review
    job_id, target = source(jobs, status='success')
    original = service.store.source(job_id, target)['result']
    original['results'][0]['data']['upstream_response'] = {'job_id': 'expected-task'}
    jobs.mark_completed(job_id=job_id, result=OrchestrateResponse.model_validate(original))
    gateway.states = [{'key': f'{job_id}:{target}', 'ean': EAN, 'account': 'jv', 'submitted_at_unix_ms': 9999999999999, 'state': 'online', 'online': True, 'task_id': 'previous-task'}]
    draft = service.draft(job_id=job_id, target=target, request_id='read')
    assert draft.item.state == 'unknown' and not draft.item.retryable
    gateway.states[0]['task_id'] = 'expected-task'
    assert service.draft(job_id=job_id, target=target, request_id='read').item.state == 'online'


def test_actual_pool_identity_is_saved_even_when_transport_fails(review):
    from src.sofort_orchestrator.application.orchestrator_service import OrchestratorService
    from src.sofort_orchestrator.infra.http_client import RetryExhaustedError

    class Pool:
        def claim_for_job(self, **kwargs):
            return EAN

    class Adapter:
        def dispatch(self, **kwargs):
            raise RetryExhaustedError('timeout', kind='timeout')

    service = OrchestratorService(adapters=Adapter(), ean_pool_gateway=Pool())
    command = OrchestrateRequest(operation='publish', payload={'title': 'Product', 'price': '99'}, channels=[ChannelTarget(marketplace='hood', account='jv', ean_source='pool')], kid_id=1, kid_number='1')
    result = service.execute(ean='source-ean', request_id='request', command=command, job_id=str(uuid.uuid4()))
    assert result.results[0].status == 'failed'
    assert result.results[0].data['submission_identity']['ean'] == EAN


def test_review_update_confirms_only_its_original_ean_slot_without_using_pool(review):
    from src.sofort_orchestrator.application.orchestrator_service import OrchestratorService

    jobs, gateway, reviews = review
    job_id, target = source(jobs, marketplace='hood', account='xl', pool=True)
    gateway.hood = SimpleNamespace(status_code=200, body={'items': [{'itemID': 'existing', 'ean': EAN}]})
    draft = reviews.draft(job_id=job_id, target=target, request_id='read')
    ean, command = reviews.prepare_retry(job_id=job_id, target=target, payload={**draft.payload, 'description': '<p>Corrected</p>'}, request_id='retry')
    calls, mappings = [], []

    class Adapter:
        def dispatch(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(status_code=200, body={'ok': True})

    class Mapping:
        def confirm(self, **kwargs):
            mappings.append(kwargs)
            return {'confirmed': True, 'mapping': {'ean': kwargs['ean'], 'status': True}}

    service = OrchestratorService(adapters=Adapter(), marketplace_ean_mapping_gateway=Mapping())
    result = service.execute(ean=ean, request_id='retry', command=command, job_id=str(uuid.uuid4()))
    assert len(calls) == 1
    assert calls[0]['operation'] is Operation.UPDATE
    assert calls[0]['payload']['description'] == '<p>Corrected</p>'
    assert len(mappings) == 1
    assert mappings[0]['ean'] == EAN and mappings[0]['account'] == 'xl'
    assert mappings[0]['kid_id'] == 1
    assert result.results[0].data['marketplace_ean_mapping']['status'] == 'confirmed'
