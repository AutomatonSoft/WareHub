import json
from contextlib import nullcontext
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import Mock, patch

from django.db import IntegrityError
from django.test import SimpleTestCase
from rest_framework.renderers import JSONRenderer

from .idempotency import claim_or_replay, finalize_error, finalize_success


class IdempotencyFinalizationTests(SimpleTestCase):
    def make_record(self):
        record = Mock(
            state="processing",
            request_hash="request-hash",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        record.save.side_effect = lambda **kwargs: json.dumps(record.response_payload)
        return record

    def test_success_preserves_json_response_and_can_be_replayed(self):
        record = self.make_record()
        payload = {
            "status_meta": {"last_pushed_at": datetime(2026, 10, 16, 9, 10, 58, tzinfo=timezone.utc)},
            "items": [{"date": date(2026, 10, 16), "price": Decimal("19.50")}],
            "active": True,
            "missing": None,
        }

        finalize_success(record, status_code=200, payload=payload)

        self.assertEqual(record.state, "completed")
        self.assertEqual(record.status_code, 200)
        self.assertEqual(record.response_payload, json.loads(JSONRenderer().render(payload)))
        self.assertIsInstance(payload["status_meta"]["last_pushed_at"], datetime)
        record.save.assert_called_once()
        with patch("database.idempotency.transaction.atomic", return_value=nullcontext()), patch(
            "database.idempotency.IdempotencyRecord.objects"
        ) as records:
            records.create.side_effect = IntegrityError()
            records.select_for_update.return_value.filter.return_value.first.return_value = record
            state, replayed = claim_or_replay(scope="hood.patch_by_ean.v2", idem_key="key", request_hash="request-hash")
        self.assertEqual(state, "replay")
        self.assertIs(replayed, record)

    def test_error_with_nested_datetime_can_be_saved(self):
        record = self.make_record()
        payload = {"errors": [{"checked_at": datetime(2026, 10, 16, tzinfo=timezone.utc)}]}

        finalize_error(record, status_code=502, payload=payload, error_code="hood_external_patch_failed")

        self.assertEqual(record.state, "failed")
        self.assertEqual(record.status_code, 502)
        self.assertEqual(record.error_code, "hood_external_patch_failed")
        self.assertEqual(record.response_payload, json.loads(JSONRenderer().render(payload)))
        record.save.assert_called_once()

    def test_non_dictionary_payload_keeps_data_wrapper(self):
        for finalize in (finalize_success, finalize_error):
            with self.subTest(finalize=finalize.__name__):
                record = self.make_record()
                arguments = {"error_code": "error"} if finalize is finalize_error else {}
                finalize(record, status_code=200, payload=[date(2026, 10, 16)], **arguments)
                self.assertEqual(record.response_payload, {"data": ["2026-10-16"]})

    def test_unsupported_objects_are_not_silently_stringified(self):
        record = self.make_record()
        with self.assertRaises(TypeError):
            finalize_success(record, status_code=200, payload={"invalid": object()})
        record.save.assert_not_called()
