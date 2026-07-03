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
