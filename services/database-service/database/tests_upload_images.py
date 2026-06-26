import os
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from .ftp_upload import _ensure_config_for_site_key


class UploadImagesToFtpTests(SimpleTestCase):
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
