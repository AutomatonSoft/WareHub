import json
from unittest.mock import Mock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from . import remote_images
from .remote_images import RemoteImageError, download_remote_image
from .views import UploadImagesToFtpAPIView


class RemoteImageTests(SimpleTestCase):
    def setUp(self):
        self.response = Mock(status=200, headers={"Content-Type": "image/jpeg"})
        self.response.read.side_effect = [b"photo", b""]
        self.pool = Mock()
        self.pool.urlopen.return_value = self.response
        self.dns = patch.object(remote_images.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("8.8.8.8", 443))])
        self.https = patch.object(remote_images, "HTTPSConnectionPool", return_value=self.pool)
        self.dns_mock = self.dns.start()
        self.https_mock = self.https.start()
        self.addCleanup(self.dns.stop)
        self.addCleanup(self.https.stop)

    def test_download_pins_public_ip_and_preserves_tls_hostname(self):
        result = download_remote_image("https://photos.example/photo.jpg", 0)
        self.assertEqual(result.read(), b"photo")
        self.assertEqual(self.https_mock.call_args.args[0], "8.8.8.8")
        self.assertEqual(self.https_mock.call_args.kwargs["assert_hostname"], "photos.example")
        self.assertFalse(self.pool.urlopen.call_args.kwargs["redirect"])
        self.response.close.assert_called_once()
        self.pool.close.assert_called_once()

    def test_private_addresses_and_invalid_urls_are_blocked(self):
        for url in ("file:///etc/passwd", "https://user:secret@photos.example/a", "https://photos.example:8443/a"):
            with self.subTest(url=url), self.assertRaises(RemoteImageError):
                download_remote_image(url, 0)
        self.dns_mock.return_value = [(2, 1, 6, "", ("127.0.0.1", 443))]
        with self.assertRaisesRegex(RemoteImageError, "non-public"):
            download_remote_image("https://photos.example/a", 0)
        self.https_mock.assert_not_called()

    def test_redirect_to_private_address_is_blocked(self):
        self.response.status = 302
        self.response.headers = {"Location": "https://internal.example/a"}
        self.dns_mock.side_effect = [[(2, 1, 6, "", ("8.8.8.8", 443))], [(2, 1, 6, "", ("10.0.0.1", 443))]]
        with self.assertRaisesRegex(RemoteImageError, "non-public"):
            download_remote_image("https://photos.example/a", 0)
        self.pool.urlopen.assert_called_once()

    def test_header_and_stream_size_limits(self):
        self.response.headers["Content-Length"] = str(remote_images.MAX_REMOTE_IMAGE_BYTES + 1)
        with self.assertRaisesRegex(RemoteImageError, "10 MiB"):
            download_remote_image("https://photos.example/a", 0)
        self.response.read.assert_not_called()
        self.response.headers.pop("Content-Length")
        with patch.object(remote_images, "MAX_REMOTE_IMAGE_BYTES", 4):
            with self.assertRaisesRegex(RemoteImageError, "10 MiB"):
                download_remote_image("https://photos.example/a", 0)

    def test_http_failure_is_explicit(self):
        self.response.status = 410
        with self.assertRaisesRegex(RemoteImageError, "HTTP 410"):
            download_remote_image("https://photos.example/a", 0)

    def test_public_redirect_and_timeout(self):
        redirect = Mock(status=302, headers={"Location": "/new.jpg"})
        self.pool.urlopen.side_effect = [redirect, self.response]
        self.assertEqual(download_remote_image("https://photos.example/old.jpg", 0).name, "new.jpg")
        redirect.close.assert_called_once()
        with patch.object(remote_images.time, "monotonic", side_effect=[0, 21]):
            with self.assertRaisesRegex(RemoteImageError, "timed out"):
                download_remote_image("https://photos.example/a", 0)

    def test_compressed_response_is_rejected_before_reading(self):
        self.response.headers["Content-Encoding"] = "gzip"
        with self.assertRaisesRegex(RemoteImageError, "Compressed"):
            download_remote_image("https://photos.example/a", 0)
        self.response.read.assert_not_called()


class MixedImageUploadTests(SimpleTestCase):
    def post(self, data):
        request = APIRequestFactory().post("/api/v1/uploads/images/", data, format="multipart")
        request.session = {"role": "admin"}
        return UploadImagesToFtpAPIView.as_view()(request)

    @patch("database.views.upload_public_file_for_site_payload")
    @patch("database.views._simple_uploaded_file_from_remote_url")
    def test_existing_and_local_photos_are_both_uploaded(self, download, upload):
        download.return_value = SimpleUploadedFile("existing.jpg", b"existing")
        upload.side_effect = lambda file, **kwargs: {"db_path": file.name, "public_url": f"https://photos.example/{file.name}"}
        response = self.post({"site": "XL", "site_key": "XLMOEBEL_DE", "source_urls": '["https://photos.example/existing.jpg"]', "images": SimpleUploadedFile("new.jpg", b"new")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["uploaded_image_urls"], ["existing.jpg", "new.jpg"])
        self.assertEqual(upload.call_count, 2)

    @patch("database.views.upload_public_file_for_site_payload")
    @patch("database.views._simple_uploaded_file_from_remote_url", side_effect=RemoteImageError("Image server returned HTTP 410."))
    def test_failed_photo_prevents_partial_ftp_upload_and_identifies_field(self, download, upload):
        response = self.post({"site": "XL", "site_key": "XLMOEBEL_DE", "source_urls": '["https://photos.example/gone.jpg"]', "images": SimpleUploadedFile("new.jpg", b"new")})
        self.assertEqual(response.status_code, 400)
        self.assertIn("HTTP 410", response.data["detail"])
        self.assertEqual(response.data["image_errors"][0]["index"], 1)
        self.assertIn("images", response.data["field_errors"])
        upload.assert_not_called()

    @patch("database.views._simple_uploaded_file_from_remote_url")
    def test_batch_size_and_count_limits(self, download):
        urls = [f"https://photos.example/{index}.jpg" for index in range(51)]
        response = self.post({"source_urls": json.dumps(urls)})
        self.assertEqual(response.status_code, 400)
        download.assert_not_called()
        download.return_value = SimpleUploadedFile("photo.jpg", b"photo")
        with patch("database.views.MAX_REMOTE_BATCH_BYTES", 4):
            response = self.post({"source_urls": '["https://photos.example/a.jpg"]'})
        self.assertEqual(response.status_code, 400)
        self.assertIn("50 MiB", response.data["detail"])
