from django.urls import path

from .views import bundles, payments, plans, store
from .views import platform as platform_views

urlpatterns = [
    # Bundles
    path("bundles/", bundles.bundle_list_create, name="bundle-list-create"),
    path("bundles/<int:pk>/", bundles.bundle_detail, name="bundle-detail"),
    # Store & Products
    path("store/", store.store_list, name="store-list"),
    path("products/", store.products_list, name="products-list"),
    # Subscription plans (public list & detail + admin access management)
    path("plans/", plans.plan_list, name="plan-list"),
    path("plans/<int:pk>/", plans.plan_detail, name="plan-detail"),
    path("plans/<int:pk>/access/", plans.plan_access, name="plan-access"),
    # Payments
    path("payments/initialize/", payments.payment_initialize, name="payment-initialize"),
    path(
        "payments/<int:payment_id>/items/<int:item_id>/refund/",
        payments.payment_item_refund,
        name="payment-item-refund",
    ),
    # Subscribe (bypass – no real payment processing)
    path("subscribe/", payments.subscribe, name="subscribe"),
    # Platform subscription (coach -> Contentor billing). Stripe-backed in M1.
    path("platform/checkout/", platform_views.start_checkout, name="platform-checkout"),
    path("platform/subscription/", platform_views.get_subscription, name="platform-subscription"),
    path("platform/plans/", platform_views.list_plans, name="platform-plans-public"),
]
