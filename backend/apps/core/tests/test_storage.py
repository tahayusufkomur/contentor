from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from apps.core import storage


@override_settings(
    AWS_ACCESS_KEY_ID="minioadmin",  # pragma: allowlist secret
    AWS_SECRET_ACCESS_KEY="minioadmin",  # noqa: S106  # pragma: allowlist secret
    AWS_BUCKET_NAME="contentor-dev-private",
    AWS_ENDPOINT="http://minio:9000",
    AWS_ENDPOINT_EXTERNAL="http://localhost:9000",
    AWS_PRESIGNED_EXPIRY=3600,
)
class PresignExternalEndpointTests(SimpleTestCase):
    def test_download_url_uses_external_endpoint(self):
        url = storage.generate_presigned_download_url("tenants/demo/x.png")
        assert url.startswith("http://localhost:9000/"), url

    def test_upload_url_uses_external_endpoint(self):
        url = storage.generate_presigned_upload_url("tenants/demo/x.png", "image/png")
        assert url.startswith("http://localhost:9000/"), url

    @override_settings(AWS_ENDPOINT_EXTERNAL="")
    def test_falls_back_to_internal_endpoint(self):
        url = storage.generate_presigned_download_url("tenants/demo/x.png")
        assert url.startswith("http://minio:9000/"), url


@override_settings(
    AWS_ACCESS_KEY_ID="minioadmin",  # pragma: allowlist secret
    AWS_SECRET_ACCESS_KEY="minioadmin",  # noqa: S106  # pragma: allowlist secret
    AWS_BUCKET_NAME="contentor-dev-private",
    AWS_ENDPOINT="http://minio:9000",
    AWS_ENDPOINT_EXTERNAL="http://localhost:9000",
    AWS_PRESIGNED_EXPIRY=3600,
)
class MultipartPresignExternalEndpointTests(SimpleTestCase):
    """
    Verify that the multipart initiate view generates part presigned URLs
    using the external endpoint (browser-reachable) rather than the internal
    Docker-network endpoint.
    """

    def _make_presign_url(self, endpoint):
        """Return a fake presigned URL rooted at the given endpoint."""
        return f"{endpoint}/contentor-dev-private/tenants/demo/library/test.mp4?X-Amz-Signature=abc"

    def test_part_urls_use_external_endpoint(self):
        """Part presigned URLs must start with AWS_ENDPOINT_EXTERNAL when set."""
        from apps.core.uploads.multipart import initiate

        internal_url = self._make_presign_url("http://minio:9000")
        external_url = self._make_presign_url("http://localhost:9000")

        internal_client = MagicMock()
        internal_client.create_multipart_upload.return_value = {"UploadId": "test-upload-id"}

        external_client = MagicMock()
        external_client.generate_presigned_url.return_value = external_url

        def fake_get_s3_client(external=False):
            return external_client if external else internal_client

        with patch("apps.core.uploads.multipart.get_s3_client", side_effect=fake_get_s3_client):
            from rest_framework.test import APIRequestFactory

            factory = APIRequestFactory()
            request = factory.post(
                "/api/v1/uploads/multipart/initiate/",
                {
                    "filename": "test.mp4",
                    "content_type": "video/mp4",
                    "category": "library",
                    "total_parts": 2,
                },
                format="json",
            )
            # Attach a minimal user so permission check can run.
            from django.contrib.auth.models import AnonymousUser

            request.user = AnonymousUser()

            # Call the view function directly, bypassing permission checks.
            with patch("apps.core.uploads.multipart.IsCoachOrOwner.has_permission", return_value=True):
                response = initiate(request)

        assert response.status_code == 200, response.data
        part_urls = response.data["part_urls"]
        assert len(part_urls) == 2, part_urls
        for url in part_urls:
            assert url.startswith("http://localhost:9000/"), (
                f"Part URL must use external endpoint; got: {url}"
            )
        # Confirm the internal client was NOT used for presigning.
        internal_client.generate_presigned_url.assert_not_called()
        # Confirm the external client WAS used for presigning.
        assert external_client.generate_presigned_url.call_count == 2

    @override_settings(AWS_ENDPOINT_EXTERNAL="")
    def test_part_urls_fall_back_to_internal_when_no_external_set(self):
        """When AWS_ENDPOINT_EXTERNAL is empty, part URLs use the internal endpoint."""
        from apps.core.uploads.multipart import initiate

        internal_url = self._make_presign_url("http://minio:9000")

        # With external=False (fallback), get_s3_client returns the same client.
        single_client = MagicMock()
        single_client.create_multipart_upload.return_value = {"UploadId": "test-upload-id-2"}
        single_client.generate_presigned_url.return_value = internal_url

        def fake_get_s3_client(external=False):
            return single_client

        with patch("apps.core.uploads.multipart.get_s3_client", side_effect=fake_get_s3_client):
            from rest_framework.test import APIRequestFactory

            factory = APIRequestFactory()
            request = factory.post(
                "/api/v1/uploads/multipart/initiate/",
                {
                    "filename": "video.mp4",
                    "content_type": "video/mp4",
                    "category": "library",
                    "total_parts": 1,
                },
                format="json",
            )
            from django.contrib.auth.models import AnonymousUser

            request.user = AnonymousUser()

            with patch("apps.core.uploads.multipart.IsCoachOrOwner.has_permission", return_value=True):
                response = initiate(request)

        assert response.status_code == 200, response.data
        part_urls = response.data["part_urls"]
        assert len(part_urls) == 1, part_urls
        assert part_urls[0].startswith("http://minio:9000/"), (
            f"Part URL must fall back to internal endpoint; got: {part_urls[0]}"
        )
