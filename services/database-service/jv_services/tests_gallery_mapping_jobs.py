from datetime import UTC, datetime, timedelta
from unittest import TestCase
from unittest.mock import MagicMock, patch

from pymongo.errors import DuplicateKeyError
from rest_framework.test import APIRequestFactory

from .gallery_mapping_jobs import enqueue_mapping, mapping_status, run_next_mapping
from .views_gallery_mapping import GalleryMappingAPIView


class MappingJobTests(TestCase):
    def test_safe_command_error_is_saved_with_its_cause(self):
        from .management.commands.map_jv_xl_gallery import GalleryMappingCommandError
        database = MagicMock()
        database.jv_xl_mapping_jobs.find_one_and_update.return_value = {"job_id": "job"}
        with patch("jv_services.gallery_mapping_jobs.call_command",
                   side_effect=GalleryMappingCommandError("Aftercool login failed: HTTP 401.")):
            run_next_mapping(database)
        values = database.jv_xl_mapping_jobs.update_one.call_args.args[1]["$set"]
        self.assertEqual(values["status"], "failed")
        self.assertEqual(values["error"], "Aftercool login failed: HTTP 401.")

    def test_unconfigured_worker_waits_without_processing_jobs(self):
        from .management.commands.run_gallery_mapping_worker import Command
        module = "jv_services.management.commands.run_gallery_mapping_worker"
        with patch(f"{module}.missing_configuration", return_value=["AFTERCOOL_PASSWORD"]), \
                patch(f"{module}.time.sleep", side_effect=KeyboardInterrupt), \
                patch(f"{module}.run_next_mapping") as run:
            with self.assertRaises(KeyboardInterrupt):
                Command().handle(once=False)
        run.assert_not_called()

    def test_start_requires_csrf_even_with_admin_session(self):
        request = APIRequestFactory(enforce_csrf_checks=True).post("/api/v1/jv/gallery-mapping/")
        request.session = {"role": "admin"}
        with patch("jv_services.views_gallery_mapping.mapping_database") as database:
            response = GalleryMappingAPIView.as_view()(request)
        self.assertEqual(response.status_code, 403)
        database.assert_not_called()

    def test_only_admin_can_access_or_start(self):
        for method in ("get", "post"):
            for role in (None, "user"):
                request = getattr(APIRequestFactory(), method)("/api/v1/jv/gallery-mapping/")
                request.session = {"role": role}
                with patch("jv_services.views_gallery_mapping.mapping_database") as database:
                    response = GalleryMappingAPIView.as_view()(request)
                self.assertEqual(response.status_code, 403)
                database.assert_not_called()

    def test_missing_configuration_has_no_credentials(self):
        request = APIRequestFactory().get("/api/v1/jv/gallery-mapping/")
        request.session = {"role": "admin"}
        with patch("jv_services.views_gallery_mapping.missing_configuration", return_value=["AFTERCOOL_PASSWORD"]):
            response = GalleryMappingAPIView.as_view()(request)
        self.assertFalse(response.data["configured"])
        self.assertEqual(response.data["missing"], ["AFTERCOOL_PASSWORD"])

    def test_duplicate_start_does_not_replace_active_job(self):
        database = MagicMock()
        database.jv_xl_mapping_jobs.update_one.side_effect = DuplicateKeyError("duplicate")
        self.assertFalse(enqueue_mapping(database))
        query = database.jv_xl_mapping_jobs.update_one.call_args.args[0]
        self.assertEqual(query["status"]["$nin"], ["queued", "running"])

    def test_worker_uses_full_command_and_heartbeats(self):
        database = MagicMock()
        database.jv_xl_mapping_jobs.find_one_and_update.return_value = {"job_id": "job"}
        database.jv_xl_mapping_jobs.update_one.return_value.matched_count = 1
        def run(*args, **kwargs):
            self.assertEqual(kwargs["max_products"], 0)
            self.assertEqual(kwargs["workers"], 3)
            kwargs["stdout"].write("phase=jv_cache next_offset=500\n")
        with patch("jv_services.gallery_mapping_jobs.call_command", side_effect=run):
            self.assertTrue(run_next_mapping(database))
        updates = database.jv_xl_mapping_jobs.update_one.call_args_list
        self.assertEqual(updates[0].args[1]["$set"]["phase"], "jv_cache")
        self.assertEqual(updates[-1].args[1]["$set"]["status"], "completed")

    def test_worker_failure_is_not_success_and_does_not_expose_exception(self):
        database = MagicMock()
        database.jv_xl_mapping_jobs.find_one_and_update.return_value = {"job_id": "job"}
        with patch("jv_services.gallery_mapping_jobs.call_command", side_effect=RuntimeError("secret")):
            run_next_mapping(database)
        values = database.jv_xl_mapping_jobs.update_one.call_args.args[1]["$set"]
        self.assertEqual(values["status"], "failed")
        self.assertNotIn("secret", values["error"])

    def test_expired_jobs_are_recoverable_and_progress_is_projected(self):
        database = MagicMock()
        database.jv_xl_mapping_jobs.find_one.return_value = {
            "job_id": "job", "status": "running", "owner": "private",
            "lease_until": datetime.now(UTC) - timedelta(minutes=1),
        }
        with patch("jv_services.gallery_mapping_jobs.GalleryMappingStore") as store:
            store.return_value.progress.find_one.return_value = {"jv_offset": 500, "xl_offset": 200,
                                                                 "jv_first_next_offset": 10}
            state = mapping_status(database)
        self.assertTrue(state["recovering"])
        self.assertEqual([state["jv_loaded"], state["xl_loaded"], state["mapped"]], [500, 200, 10])
        self.assertNotIn("owner", state)
        database.jv_xl_mapping_jobs.find_one_and_update.return_value = None
        self.assertFalse(run_next_mapping(database))
        query = database.jv_xl_mapping_jobs.find_one_and_update.call_args.args[0]
        self.assertEqual(query["$or"][1]["status"], "running")
        self.assertIn("$lt", query["$or"][1]["lease_until"])

    def test_start_reports_accepted_or_conflict(self):
        for created, expected in ((True, 202), (False, 409)):
            request = APIRequestFactory().post("/api/v1/jv/gallery-mapping/", {}, format="json")
            request.session = {"role": "admin"}
            with patch("jv_services.views_gallery_mapping.missing_configuration", return_value=[]), \
                    patch("jv_services.views_gallery_mapping.mapping_database"), \
                    patch("jv_services.views_gallery_mapping.enqueue_mapping", return_value=created), \
                    patch("jv_services.views_gallery_mapping.mapping_status", return_value={"status": "queued"}):
                response = GalleryMappingAPIView.as_view()(request)
            self.assertEqual(response.status_code, expected)
