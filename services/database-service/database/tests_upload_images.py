import json
import os
from ftplib import error_perm
from unittest.mock import Mock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from . import ftp_upload
from .ftp_upload import _ensure_config_for_site_key


class UploadImagesToFtpTests(SimpleTestCase):
    def test_connection_limit_error_is_recognized(self):
        self.assertTrue(
            ftp_upload._is_ftp_connection_limit_error(
                error_perm("530 Sorry, the maximum number of connections (10) for your host are already connected.")
            )
        )
        self.assertFalse(ftp_upload._is_ftp_connection_limit_error(error_perm("530 Login incorrect.")))

    def test_connection_limit_retries_upload_operation(self):
        attempts = 0

        def operation():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise error_perm("530 Sorry, the maximum number of connections (10) for your host are already connected.")
            return "uploaded"

        with (
            patch.object(ftp_upload, "UPLOAD_FTP_CONNECTION_RETRIES", 2),
            patch.object(ftp_upload, "sleep") as sleep_mock,
        ):
            result = ftp_upload._limit_ftp_upload_connections(operation)()

        self.assertEqual(result, "uploaded")
        self.assertEqual(attempts, 2)
        sleep_mock.assert_called_once()

    def test_distributed_ftp_lock_uses_the_endpoint_specific_key(self):
        lock = Mock()
        lock.acquire.return_value = True
        client = Mock()
        client.lock.return_value = lock

        with (
            patch.object(ftp_upload, "FTP_UPLOAD_REDIS_URL", "redis://example.test:6379/0"),
            patch("redis.Redis.from_url", return_value=client),
        ):
            with ftp_upload._distributed_ftp_upload_lock(host="ftp.example.test", user="warehouse"):
                pass

        client.lock.assert_called_once_with(
            f"{ftp_upload._ftp_upload_lock_name(host='ftp.example.test', user='warehouse')}:0",
            timeout=ftp_upload.FTP_UPLOAD_REDIS_LOCK_TIMEOUT_SECONDS,
        )
        lock.acquire.assert_called_once_with(blocking=False)
        lock.release.assert_called_once()
        client.close.assert_called_once()

    def test_jv_upload_reuses_one_ftp_connection_for_all_main_image_paths(self):
        ftp = Mock()
        ftp.sock = object()
        config = (
            "ftp.example.test",
            21,
            "warehouse",
            "password",
            ["site-root", "images"],
            "https://www.example.test",
            "images",
            False,
            True,
            15,
        )

        with (
            patch.object(ftp_upload, "_ensure_config_for_site_key", return_value=config),
            patch.object(ftp_upload, "_read_uploaded_bytes", return_value=b"image"),
            patch.object(ftp_upload, "_repair_known_image_header_corruption", return_value=b"image"),
            patch.object(ftp_upload, "_validate_uploaded_image_bytes", return_value=".jpg"),
            patch.object(ftp_upload, "_compress_image_bytes_if_needed", return_value=(b"image", ".jpg")),
            patch.object(ftp_upload, "_run_ftp_upload", side_effect=lambda operation, **_kwargs: operation()),
            patch.object(ftp_upload, "FTP", return_value=ftp),
        ):
            ftp_upload.upload_jv_product_file_for_site(
                SimpleUploadedFile("main.jpg", b"image", content_type="image/jpeg"),
                site_key="JV_DE",
                ean="4069943341201",
                kind="main",
            )

        ftp.connect.assert_called_once_with(host="ftp.example.test", port=21, timeout=15)
        self.assertEqual(ftp.storbinary.call_count, 4)
        ftp.quit.assert_called_once()

    def test_normalize_managed_public_base_url_prefers_prod_root_dir(self):
        normalized = ftp_upload._normalize_managed_public_base_url(
            "https://mediawarehub.veloxdesk.com/warehub/dev",
            storage_root_dir="",
            root_dir="warehub/prod",
        )

        self.assertEqual(normalized, "https://mediawarehub.veloxdesk.com/warehub/prod")

    def test_normalize_managed_public_photo_url_rewrites_dev_record_to_prod(self):
        with (
            patch.object(ftp_upload, "UPLOAD_FTP_PUBLIC_BASE_URL", "https://mediawarehub.veloxdesk.com/warehub/dev"),
            patch.object(ftp_upload, "UPLOAD_FTP_ROOT_DIR", "warehub/prod"),
            patch.object(ftp_upload, "UPLOAD_FTP_STORAGE_ROOT_DIR", ""),
        ):
            normalized = ftp_upload.normalize_managed_public_photo_url(
                "https://mediawarehub.veloxdesk.com/warehub/dev/images/example.png"
            )

        self.assertEqual(normalized, "https://mediawarehub.veloxdesk.com/warehub/prod/images/example.png")

    def test_normalize_managed_public_photo_value_flattens_nested_json_photo_urls(self):
        photo_url = "https://mediawarehub.veloxdesk.com/warehub/stage/images/example.png"
        malformed_value = json.dumps([json.dumps([json.dumps([photo_url])])])

        with (
            patch.object(ftp_upload, "UPLOAD_FTP_PUBLIC_BASE_URL", "https://mediawarehub.veloxdesk.com/warehub/stage"),
            patch.object(ftp_upload, "UPLOAD_FTP_ROOT_DIR", "warehub/stage"),
            patch.object(ftp_upload, "UPLOAD_FTP_STORAGE_ROOT_DIR", ""),
        ):
            normalized = ftp_upload.normalize_managed_public_photo_value(malformed_value)

        self.assertEqual(normalized, [photo_url])

    @override_settings(DEBUG=True)
    @patch.dict(os.environ, {"DEV_ALLOW_ALL": "true"}, clear=False)
    @patch("database.views.upload_public_file_for_site_payload")
    def test_xl_upload_returns_open_cart_db_path_and_public_url(self, mock_upload):
        mock_upload.return_value = {
            "db_path": "images/xl_xlmoebel_de_20260526000000_abcd1234.jpg",
            "public_url": "https://www.xlmoebel.de/image/images/xl_xlmoebel_de_20260526000000_abcd1234.jpg",
            "filename": "xl_xlmoebel_de_20260526000000_abcd1234.jpg",
        }

        response = APIClient().post(
            "/api/v1/uploads/images/?site=XL&site_key=XLMOEBEL_DE&ean=4069943341201",
            {"images": [SimpleUploadedFile("main.jpg", b"\xff\xd8\xff\xe0image", content_type="image/jpeg")]},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["uploaded_image_urls"], ["images/xl_xlmoebel_de_20260526000000_abcd1234.jpg"])
        self.assertEqual(
            response.data["uploaded_image_public_urls"],
            ["https://www.xlmoebel.de/image/images/xl_xlmoebel_de_20260526000000_abcd1234.jpg"],
        )
        self.assertEqual(response.data["image"], "images/xl_xlmoebel_de_20260526000000_abcd1234.jpg")
        self.assertEqual(
            response.data["image_public_url"],
            "https://www.xlmoebel.de/image/images/xl_xlmoebel_de_20260526000000_abcd1234.jpg",
        )

    @patch.dict(
        os.environ,
        {
            "XLMOEBEL_DE_FTP_HOST": "ftp.example",
            "XLMOEBEL_DE_FTP_USER": "user",
            "XLMOEBEL_DE_FTP_PASSWORD": "password",
            "UPLOAD_FTP_ROOT_DIR": "warehub",
            "UPLOAD_FTP_STORAGE_ROOT_DIR": "mediawarehub.veloxdesk.com/warehub",
            "UPLOAD_FTP_PUBLIC_BASE_URL": "https://mediawarehub.veloxdesk.com/warehub",
            "UPLOAD_FTP_IMAGE_DIR": "images",
        },
        clear=False,
    )
    def test_xl_site_specific_ftp_uses_site_root_and_site_public_url(self):
        _host, _port, _user, _password, remote_parts, public_base, image_dir, *_rest = _ensure_config_for_site_key(
            "XLMOEBEL_DE",
            leaf_dir="images",
        )

        self.assertEqual(remote_parts, ["image", "images"])
        self.assertEqual(public_base, "https://www.xlmoebel.de/image")
        self.assertEqual(image_dir, "images")
