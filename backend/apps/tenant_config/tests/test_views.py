from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment
from apps.courses.models import Course, Video
from apps.downloads.models import DownloadFile
from apps.media.models import Photo

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@tenantconfigtest.com",
        name="Owner",
        password="secret123",
        role="owner",
    )


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@tenantconfigtest.com",
        name="Coach",
        password="secret123",
        role="coach",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@tenantconfigtest.com",
        name="Student",
        password="secret123",
        role="student",
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestAdminStats:
    def test_owner_gets_expected_stats_payload(self, owner, student):
        User.objects.create_user(
            email="student2@tenantconfigtest.com",
            name="Student Two",
            password="secret123",
            role="student",
        )
        Course.objects.create(title="Course One", slug="course-one", instructor=owner, pricing_type="free")
        Course.objects.create(title="Course Two", slug="course-two", instructor=owner, pricing_type="paid", price=50)

        Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=Decimal("120.00"),
            platform_fee=Decimal("12.00"),
            submerchant_payout=Decimal("108.00"),
            currency="TRY",
            provider="bypass",
        )
        Payment.objects.create(
            student=student,
            payment_type="subscription",
            status="completed",
            amount=Decimal("80.00"),
            platform_fee=Decimal("8.00"),
            submerchant_payout=Decimal("72.00"),
            currency="TRY",
            provider="bypass",
        )
        Payment.objects.create(
            student=student,
            payment_type="refund",
            status="refunded",
            amount=Decimal("20.00"),
            platform_fee=Decimal("0.00"),
            submerchant_payout=Decimal("0.00"),
            currency="TRY",
            provider="bypass",
        )

        Photo.objects.create(s3_key="photos/a.jpg", title="A", file_size=2 * 1024 * 1024)
        Video.objects.create(title="Video A", file_size=3 * 1024 * 1024)
        DownloadFile.objects.create(title="Download A", file_url="downloads/a.pdf", file_size=1 * 1024 * 1024)

        client = make_client(owner)
        response = client.get("/api/v1/admin/stats/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["students"] == 2
        assert data["courses"] == 2
        assert data["revenue"] == 180.0
        assert data["storage_used"] == "6.0 MB"

    def test_coach_can_access_stats(self, coach):
        client = make_client(coach)
        response = client.get("/api/v1/admin/stats/")
        assert response.status_code == 200, response.content

    def test_student_cannot_access_stats(self, student):
        client = make_client(student)
        response = client.get("/api/v1/admin/stats/")
        assert response.status_code == 403, response.content

    def test_unauthenticated_cannot_access_stats(self, tenant_ctx):
        client = make_client()
        response = client.get("/api/v1/admin/stats/")
        assert response.status_code in (401, 403), response.content
