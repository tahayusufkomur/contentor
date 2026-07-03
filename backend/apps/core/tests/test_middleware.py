"""
Unit tests for TenantRateLimitMiddleware.

Tests the sliding-window rate limiter using mocked Redis and tenant context.
No database or tenant setup is needed -- pure unit tests with unittest.mock.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.http import JsonResponse
from django.test import RequestFactory, TestCase

from apps.core.middleware.rate_limit import TenantRateLimitMiddleware


class TestTenantRateLimitMiddleware(TestCase):
    """Unit tests for TenantRateLimitMiddleware."""

    def setUp(self):
        self.factory = RequestFactory()
        self.get_response = MagicMock(return_value=JsonResponse({"ok": True}))
        self.middleware = TenantRateLimitMiddleware(self.get_response)

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    def _make_request(self, path="/api/v1/courses/", cookies=None, auth_header=None):
        """Build a minimal GET request with optional JWT cookie or auth header."""
        request = self.factory.get(path)
        if cookies:
            for key, value in cookies.items():
                request.COOKIES[key] = value
        if auth_header:
            request.META["HTTP_AUTHORIZATION"] = auth_header
        return request

    def _make_tenant(self, schema_name="test_tenant"):
        return SimpleNamespace(schema_name=schema_name)

    # -----------------------------------------------------------------
    # Tests
    # -----------------------------------------------------------------

    @patch("apps.core.middleware.rate_limit.connection")
    def test_skips_public_schema(self, mock_connection):
        """Public schema requests pass through without rate limiting."""
        mock_connection.tenant = self._make_tenant("public")
        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch("apps.core.middleware.rate_limit.connection")
    def test_skips_no_tenant(self, mock_connection):
        """Requests with no tenant on the connection pass through."""
        mock_connection.tenant = None
        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_skips_admin_users(self, mock_connection, mock_jwt, mock_redis):
        """Admin users (owner/coach) skip rate limiting."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.return_value = {"role": "owner"}
        request = self._make_request(cookies={"contentor_access_token": "valid-jwt-token"})

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)
        mock_redis.assert_not_called()

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_skips_admin_via_bearer_header(self, mock_connection, mock_jwt, mock_redis):
        """Admin users via Bearer authorization header skip rate limiting."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.return_value = {"role": "coach"}
        request = self._make_request(auth_header="Bearer valid-jwt-token")

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)
        mock_redis.assert_not_called()

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_skips_tenant_config_endpoint(self, mock_connection, mock_redis):
        """The tenant-config endpoint is never rate limited (it resolves the site)."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        request = self._make_request(path="/api/v1/admin/config/")

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)
        mock_redis.assert_not_called()

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_allows_under_limit(self, mock_connection, mock_jwt, mock_redis):
        """Requests under the rate limit pass through."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")

        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, None, 50, None]  # zcard=50 < 100
        mock_redis.return_value.pipeline.return_value = mock_pipe

        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_blocks_over_limit(self, mock_connection, mock_jwt, mock_redis):
        """Requests over the rate limit return 429."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")

        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, None, 101, None]  # zcard=101 > 100
        mock_redis.return_value.pipeline.return_value = mock_pipe

        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_not_called()
        self.assertEqual(response.status_code, 429)
        self.assertIn("Rate limit exceeded", response.content.decode())

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_uses_upload_rate_for_upload_path(self, mock_connection, mock_jwt, mock_redis):
        """Upload paths use the lower UPLOAD_RATE (10) instead of DEFAULT_RATE."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")

        mock_pipe = MagicMock()
        # 11 requests: over UPLOAD_RATE=10 but under DEFAULT_RATE=100
        mock_pipe.execute.return_value = [None, None, 11, None]
        mock_redis.return_value.pipeline.return_value = mock_pipe

        request = self._make_request(path="/api/v1/upload/photo/")

        response = self.middleware(request)

        self.get_response.assert_not_called()
        self.assertEqual(response.status_code, 429)

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_upload_path_allows_under_upload_limit(self, mock_connection, mock_jwt, mock_redis):
        """Upload requests under the upload rate limit pass through."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")

        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, None, 5, None]  # 5 < 10
        mock_redis.return_value.pipeline.return_value = mock_pipe

        request = self._make_request(path="/api/v1/upload/photo/")

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_handles_redis_failure_gracefully(self, mock_connection, mock_jwt, mock_redis):
        """Redis failure is handled gracefully (fail-open): request passes through."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")
        mock_redis.side_effect = ConnectionError("Redis is down")

        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @patch("apps.core.middleware.rate_limit.get_redis_connection")
    @patch("apps.core.middleware.rate_limit.jwt")
    @patch("apps.core.middleware.rate_limit.connection")
    def test_handles_redis_pipeline_failure_gracefully(self, mock_connection, mock_jwt, mock_redis):
        """Redis pipeline execution failure is handled gracefully (fail-open)."""
        mock_connection.tenant = self._make_tenant("my_tenant")
        mock_jwt.decode.side_effect = Exception("no token")

        mock_pipe = MagicMock()
        mock_pipe.execute.side_effect = Exception("Pipeline error")
        mock_redis.return_value.pipeline.return_value = mock_pipe

        request = self._make_request()

        response = self.middleware(request)

        self.get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)
