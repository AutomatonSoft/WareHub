from unittest import TestCase
from unittest.mock import MagicMock, patch
from threading import Event
from io import StringIO

from .gallery_mapping import GalleryProduct, map_gallery_page, match_gallery
from .gallery_mapping_store import GalleryMappingStore
from .aftercool_gallery_client import AftercoolGalleryClient


class GalleryMappingTests(TestCase):
    def test_login_error_preserves_http_status_not_response_body(self):
        from .aftercool_gallery_client import AftercoolReadError
        session = MagicMock()
        session.post.return_value.status_code = 401
        session.post.return_value.text = "private response body"
        with patch.object(AftercoolGalleryClient, "_new_session", return_value=session):
            with self.assertRaisesRegex(AftercoolReadError, r"HTTP 401") as error:
                AftercoolGalleryClient("private-user", "private-password")
        self.assertNotIn("private", str(error.exception))
        session.close.assert_called_once()

    def test_read_network_error_does_not_expose_credentials(self):
        import requests
        from .aftercool_gallery_client import AftercoolReadError
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        client.dataset = "lister"
        client.session = MagicMock()
        client.session.get.side_effect = requests.Timeout("private connection data")
        with self.assertRaisesRegex(AftercoolReadError, r"network failure \(Timeout\)") as error:
            client.get_product(0)
        self.assertNotIn("private", str(error.exception))

    def test_command_preserves_safe_aftercool_error(self):
        from .aftercool_gallery_client import AftercoolReadError
        from .management.commands.map_jv_xl_gallery import Command, GalleryMappingCommandError
        with patch.dict("os.environ", {"AFTERCOOL_USERNAME": "test", "AFTERCOOL_PASSWORD": "test"}), \
                patch("jv_services.management.commands.map_jv_xl_gallery.AftercoolGalleryClient",
                      side_effect=AftercoolReadError("Aftercool login failed: HTTP 401.")):
            with self.assertRaisesRegex(GalleryMappingCommandError, "HTTP 401"):
                Command(stdout=StringIO()).handle(write=False, max_products=1, page_size=500, workers=3, dataset="lister")

    def test_aftercool_contract_and_candidate_pagination(self):
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        client.dataset = "lister"
        client.session = MagicMock()
        item = {"account": "XL", "dataset": "lister", "product_id": "1", "ean": "001",
                "factory_id": "2", "source_file": "file.csv", "row_no": 0,
                "row": {"GalleryURL": "https://example.org/a.jpg"}}
        response = client.session.get.return_value
        response.status_code = 200
        response.json.side_effect = [
            {"items": [item], "total": 2, "offset": 0, "has_more": True},
            {"items": [item], "total": 2, "offset": 1, "has_more": False},
        ]
        self.assertEqual(len(list(client.find_candidates(item["row"]["GalleryURL"]))), 2)
        self.assertEqual(client.session.get.call_args.kwargs["params"]["offset"], 1)
        response.json.side_effect = None
        response.json.return_value = {"items": [], "total": 2, "offset": 0, "has_more": False}
        with self.assertRaises(ValueError):
            client.get_product(0)

    def setUp(self):
        self.product = GalleryProduct("jv-1", "jv", "04062292011702", "https://example.org/image.jpg")
        self.candidate = GalleryProduct("xl-1", "xl", "4260533186282", self.product.gallery_url)

    def test_only_one_exact_match_is_linked(self):
        self.assertEqual(match_gallery(self.product, [self.candidate]).xl_ean, "4260533186282")
        for url in ("https://example.org/image.jpg?size=1", "https://example.org/IMAGE.jpg", " https://example.org/image.jpg"):
            with self.subTest(url=url):
                result = match_gallery(self.product, [GalleryProduct("xl-2", "xl", "123", url)])
                self.assertEqual(result.reason, "not_found")
                self.assertIsNone(result.xl_ean)

    def test_unmatched_ambiguous_and_missing_ean_keep_jv(self):
        for candidates, reason in (
            ([], "not_found"),
            ([self.candidate, self.candidate], "multiple_matches"),
            ([GalleryProduct("xl-2", "xl", None, self.product.gallery_url)], "missing_xl_ean"),
            ([self.candidate, GalleryProduct("xl-2", "xl", None, self.product.gallery_url)], "multiple_matches"),
        ):
            with self.subTest(reason=reason):
                result = match_gallery(self.product, candidates)
                self.assertEqual(result.product, self.product)
                self.assertIsNone(result.xl_ean)
                self.assertEqual(result.reason, reason)

    def test_missing_jv_fields_are_preserved(self):
        product = GalleryProduct("jv-2", "jv", None, None)
        result = match_gallery(product, [])
        self.assertEqual(result.product, product)
        self.assertEqual(result.reason, "missing_gallery_url")

    def test_api_failure_saves_jv_without_advancing_checkpoint(self):
        save, checkpoint = MagicMock(), MagicMock()
        with self.assertRaises(TimeoutError):
            map_gallery_page(4, get_product=lambda offset: self.product,
                             find_candidates=MagicMock(side_effect=TimeoutError), save=save, checkpoint=checkpoint)
        self.assertEqual(save.call_args.args[0].reason, "lookup_pending")
        self.assertIsNone(save.call_args.args[0].xl_ean)
        checkpoint.assert_not_called()

    def test_checkpoint_is_after_final_save_and_empty_page_stops(self):
        events = []
        self.assertTrue(map_gallery_page(
            0, get_product=lambda offset: self.product, find_candidates=lambda url: [self.candidate],
            save=lambda value: events.append(value.reason), checkpoint=lambda offset: events.append(offset),
        ))
        self.assertEqual(events, ["lookup_pending", "matched", 1])
        save, checkpoint = MagicMock(), MagicMock()
        self.assertFalse(map_gallery_page(1, get_product=lambda offset: None,
                                         find_candidates=MagicMock(), save=save, checkpoint=checkpoint))
        save.assert_not_called()
        checkpoint.assert_not_called()

    def test_wrong_account_and_non_string_ean_are_rejected(self):
        with self.assertRaises(ValueError):
            match_gallery(self.product, [self.product])
        with self.assertRaises(ValueError):
            GalleryProduct("id", "jv", 123, "url")

    def test_failed_final_write_does_not_advance_checkpoint(self):
        checkpoint = MagicMock()
        with self.assertRaises(OSError):
            map_gallery_page(0, get_product=lambda offset: self.product,
                             find_candidates=lambda url: [self.candidate],
                             save=MagicMock(side_effect=[None, OSError("write failed")]), checkpoint=checkpoint)
        checkpoint.assert_not_called()

    def test_checkpoint_defaults_to_zero_and_rejects_invalid_state(self):
        database = MagicMock()
        store = GalleryMappingStore(database, source_url="https://aftercool.de", dataset="lister")
        store.progress.find_one.return_value = None
        self.assertEqual(store.next_offset(), 0)
        store.progress.find_one.return_value = {"next_offset": 5}
        self.assertEqual(store.next_offset(), 5)
        store.progress.find_one.return_value = {"next_offset": -1}
        with self.assertRaises(ValueError):
            store.next_offset()

    def test_mongo_upsert_keeps_stable_identity_and_null_clears_old_xl(self):
        database = MagicMock()
        store = GalleryMappingStore(database, source_url="https://aftercool.de", dataset="lister")
        store.save(match_gallery(self.product, [self.candidate]))
        store.save(match_gallery(self.product, []))
        calls = store.rows.bulk_write.call_args_list
        first, second = [call.args[0][0] for call in calls]
        self.assertEqual(first._filter, second._filter)
        self.assertTrue(second._upsert)
        self.assertEqual(second._doc["$set"]["jv_ean"], "04062292011702")
        self.assertIsNone(second._doc["$set"]["xl_ean"])

    def test_cached_mapping_requires_complete_xl_and_preserves_ambiguity(self):
        database = MagicMock()
        database.__getitem__.side_effect = lambda name: collections.setdefault(name, MagicMock())
        collections = {}
        store = GalleryMappingStore(database, source_url="https://aftercool.de", dataset="lister")
        store.progress.find_one.return_value = {"xl_complete": False}
        with self.assertRaises(ValueError):
            store.map_cached_page([self.product], 0)
        store.rows.bulk_write.assert_not_called()
        store.progress.find_one.return_value = {"xl_complete": True}
        row = {"source_id": "xl-1", "ean": "123", "_id": self.product.gallery_url, "count": 2}
        store.xl_cache.aggregate.return_value = [row]
        store.map_cached_page([self.product], 0)
        document = store.rows.bulk_write.call_args.args[0][0]._doc["$set"]
        self.assertEqual(document["reason"], "multiple_matches")
        self.assertIsNone(document["xl_ean"])
        self.assertEqual(store.xl_cache.aggregate.call_args.kwargs["collation"].document, {"locale": "simple"})

    def test_one_cache_query_maps_a_whole_page_without_losing_jv(self):
        store = GalleryMappingStore(MagicMock(), source_url="https://aftercool.de", dataset="lister")
        store.progress.find_one.return_value = {"xl_complete": True}
        store.xl_cache.aggregate.return_value = [
            {"_id": self.product.gallery_url, "count": 1, "source_id": "xl", "ean": "123"},
        ]
        missing = GalleryProduct("jv-2", "jv", "456", "https://example.org/missing.jpg")
        store.map_cached_page([self.product, missing], 10)
        store.xl_cache.aggregate.assert_called_once()
        operations = store.rows.bulk_write.call_args.args[0]
        self.assertEqual([operation._doc["$set"]["xl_ean"] for operation in operations], ["123", None])
        self.assertEqual(store.progress.update_one.call_args.args[1]["$set"]["jv_first_next_offset"], 12)

    def test_jv_cache_keeps_source_before_xl_and_write_failure_does_not_advance(self):
        store = GalleryMappingStore(MagicMock(), source_url="https://aftercool.de", dataset="lister")
        store.cache_jv_page([self.product], 0, False)
        document = store.rows.bulk_write.call_args.args[0][0]._doc["$set"]
        self.assertEqual(document["jv_ean"], self.product.ean)
        self.assertIsNone(document["xl_ean"])
        self.assertEqual(document["jv_position"], 0)
        self.assertTrue(store.progress.update_one.call_args.args[1]["$set"]["jv_complete"])
        store.progress.update_one.reset_mock()
        store.rows.bulk_write.side_effect = OSError("failed")
        with self.assertRaises(OSError):
            store.cache_jv_page([self.product], 1, True)
        store.progress.update_one.assert_not_called()

    def test_cached_jv_page_rejects_gaps(self):
        store = GalleryMappingStore(MagicMock(), source_url="https://aftercool.de", dataset="lister")
        store.progress.find_one.return_value = {"jv_complete": True, "jv_offset": 2}
        store.rows.find.return_value.sort.return_value.limit.return_value = [{
            "jv_position": 1, "jv_source_id": "jv", "jv_ean": "123", "gallery_url": None,
        }]
        with self.assertRaisesRegex(ValueError, "gap"):
            store.get_jv_page(0, 2)

    def test_command_loads_jv_before_xl_and_maps_saved_jv(self):
        from .management.commands.map_jv_xl_gallery import Command
        events = []
        client, store = MagicMock(), MagicMock()
        def pages(account, *args, **kwargs):
            yield 0, [self.product if account == "jv" else self.candidate], False
        client.iter_product_pages.side_effect = pages
        store.progress.find_one.side_effect = [{}, {"jv_complete": True}, {"jv_complete": True}]
        store.progress.update_one.return_value.matched_count = 1
        store.get_jv_page.side_effect = [[self.product], []]
        store.cache_jv_page.side_effect = lambda *args: events.append("jv")
        store.cache_xl_page.side_effect = lambda *args: events.append("xl")
        store.map_cached_page.side_effect = lambda *args: events.append("map")
        module = "jv_services.management.commands.map_jv_xl_gallery"
        with patch.dict("os.environ", {"AFTERCOOL_USERNAME": "test", "AFTERCOOL_PASSWORD": "test",
                                       "JV_XL_MAPPING_MONGO_URI": "mongodb://test", "JV_XL_MAPPING_MONGO_DATABASE": "test"}), \
                patch(f"{module}.AftercoolGalleryClient", return_value=client), \
                patch(f"{module}.MongoClient"), patch(f"{module}.GalleryMappingStore", return_value=store):
            Command(stdout=StringIO()).handle(write=True, max_products=0, page_size=500, workers=3, dataset="lister")
        self.assertEqual(events, ["jv", "xl", "map"])

    def test_separate_mongo_credentials_require_both_fields(self):
        from .management.commands.map_jv_xl_gallery import Command
        from django.core.management.base import CommandError
        with patch.dict("os.environ", {"AFTERCOOL_USERNAME": "test", "AFTERCOOL_PASSWORD": "test",
                                       "JV_XL_MAPPING_MONGO_URI": "mongodb://localhost", "JV_XL_MAPPING_MONGO_DATABASE": "test",
                                       "JV_XL_MAPPING_MONGO_USERNAME": "test", "JV_XL_MAPPING_MONGO_PASSWORD": ""}):
            with self.assertRaisesRegex(CommandError, "Both MongoDB"):
                Command(stdout=StringIO()).handle(write=True, max_products=0, page_size=500, workers=3, dataset="lister")

    def test_prefetch_overlaps_processing_and_respects_sample_limit(self):
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        started = Event()
        calls = []
        def get_products(account, offset, limit):
            calls.append((offset, limit))
            if offset == 2:
                started.set()
            return [self.product] * limit, True
        client.get_products = get_products
        pages = client.iter_product_pages("jv", 0, 2, 3)
        try:
            self.assertEqual(next(pages)[0], 0)
            self.assertTrue(started.wait(timeout=2))
            self.assertEqual(next(pages)[0], 2)
            with self.assertRaises(StopIteration):
                next(pages)
            self.assertEqual(calls, [(0, 2), (2, 1)])
        finally:
            pages.close()

    def test_failed_prefetched_page_is_not_yielded(self):
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        client.get_products = MagicMock(side_effect=[([self.product], True), TimeoutError])
        pages = client.iter_product_pages("jv", 5, 1)
        try:
            self.assertEqual(next(pages)[0], 5)
            with self.assertRaises(TimeoutError):
                next(pages)
        finally:
            pages.close()

    def test_parallel_pages_are_yielded_in_order_and_readers_close(self):
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        readers = [MagicMock() for _ in range(3)]
        released = Event()
        def read(account, offset, limit):
            if offset == 0:
                if not released.wait(timeout=2):
                    raise TimeoutError("parallel request did not start")
            else:
                released.set()
            return [self.product] * limit, True
        for reader in readers:
            reader.get_products.side_effect = read
        client._fork_reader = MagicMock(side_effect=readers)
        pages = list(client.iter_product_pages("jv", 0, 2, 5, workers=3))
        self.assertEqual([offset for offset, _, _ in pages], [0, 2, 4])
        self.assertEqual([len(products) for _, products, _ in pages], [2, 2, 1])
        for reader in readers:
            reader.close.assert_called_once()

    def test_short_non_final_page_stops_before_skipping_records(self):
        client = AftercoolGalleryClient.__new__(AftercoolGalleryClient)
        client.get_products = MagicMock(return_value=([self.product], True))
        with self.assertRaisesRegex(ValueError, "short non-final"):
            list(client.iter_product_pages("jv", 0, 2, 2))

    def test_failed_cache_write_does_not_mark_cache_complete(self):
        store = GalleryMappingStore(MagicMock(), source_url="https://aftercool.de", dataset="lister")
        store.xl_cache.bulk_write.side_effect = OSError("write failed")
        with self.assertRaises(OSError):
            store.cache_xl_page([self.candidate], 0, False)
        store.progress.update_one.assert_not_called()
