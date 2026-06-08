from django.urls import path

from .views import bundles, connect, payments, plans, store
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
    path("payments/<int:payment_id>/", payments.payment_detail, name="payment-detail"),
    path(
        "payments/<int:payment_id>/items/<int:item_id>/refund/",
        payments.payment_item_refund,
        name="payment-item-refund",
    ),
    # Subscribe + student subscription lifecycle
    path("subscribe/", payments.subscribe, name="subscribe"),
    path("subscriptions/", payments.my_subscriptions, name="my-subscriptions"),
    path(
        "subscriptions/<int:subscription_id>/cancel/",
        payments.subscription_cancel,
        name="subscription-cancel",
    ),
    path(
        "subscriptions/<int:subscription_id>/change-plan/",
        payments.subscription_change_plan,
        name="subscription-change-plan",
    ),
    # Stripe Connect — coach payout onboarding (Phase B)
    path("connect/onboard/", connect.connect_onboard, name="connect-onboard"),
    path("connect/status/", connect.connect_status, name="connect-status"),
    path("connect/dashboard/", connect.connect_dashboard, name="connect-dashboard"),
    # Platform subscription (coach -> Contentor billing). Stripe-backed in M1.
    path("platform/checkout/", platform_views.start_checkout, name="platform-checkout"),
    path("platform/subscription/", platform_views.get_subscription, name="platform-subscription"),
    path("platform/plans/", platform_views.list_plans, name="platform-plans-public"),
]
