# Dual Access Pricing: Content Accessible via Both Purchase and Subscription

**Date:** 2026-03-22
**Status:** Approved

## Problem

Currently, each content item (Course, LiveClass, LiveStream, ZoomClass, OnsiteEvent, DownloadFile) has a `pricing_type` field with three mutually exclusive choices: `free`, `paid`, `subscription`. A coach must pick one — either the item is purchasable one-time OR subscription-only.

The business need is that content should be accessible through both paths simultaneously. Example: a monthly yoga subscription includes unlimited live classes and courses, but a person without a subscription can also buy a single live class directly.

## Design Decision

**Approach: Simplify `pricing_type` to `free`/`paid`, decouple subscription access.**

Subscription access is already managed independently via `SubscriptionPlanAccess` (a GenericForeignKey linking content items to subscription plans). The `pricing_type="subscription"` option is redundant — it just prevents direct purchase of items that happen to be linked to a plan.

By removing the `subscription` choice, we get dual access for free: any `paid` item can be purchased directly, and if it's also linked to a plan via `SubscriptionPlanAccess`, subscribers get access too.

## Changes

### 1. Model Changes

**All 6 content models** (`Course`, `LiveClass`, `LiveStream`, `ZoomClass`, `OnsiteEvent`, `DownloadFile`):
- `pricing_type` choices change from `("free", "paid", "subscription")` to `("free", "paid")`
- No new fields, no new models

**Data migration:**
- All rows with `pricing_type="subscription"` migrate to `pricing_type="paid"`
- These items already have prices set and are already linked via `SubscriptionPlanAccess`

### 2. ContentAccessService Changes (`apps/core/access.py`)

**`get_access_info()` — unlock_method logic (lines 75-79):**
- Before: returns `"purchase"` for paid items, `"subscribe"` for subscription items
- After: for `paid` items without access, check if the item is linked to any `SubscriptionPlanAccess`. Return `unlock_method` as a list:
  - `["purchase"]` — paid item not linked to any plan
  - `["purchase", "subscribe"]` — paid item also linked to a subscription plan
  - Empty for free items

**`bulk_check_access()` — unauthenticated path (line 116):**
- Same change: determine unlock methods by checking `SubscriptionPlanAccess` linkage rather than `pricing_type`

**`get_unlock_options()`:**
- Already works correctly — checks purchase price, bundles, AND subscription plans independently of `pricing_type`
- The `pricing_type == "paid"` check on line 189 continues to work since former subscription items become paid

### 3. AccessInfo Dataclass Change

- `unlock_method: str | None` becomes `unlock_methods: list[str]`
- Possible values in list: `"purchase"`, `"subscribe"`

### 4. Store View Changes (`apps/billing/views/store.py`)

- `_collect_store_items()` filters `pricing_type="paid"` — after migration, former subscription-only items will have `pricing_type="paid"` and appear in the store automatically
- No filter changes needed

### 5. Payment View Changes (`apps/billing/views/payments.py`)

- Line 67: `pricing_type != "paid"` check — works correctly after migration, no changes needed

### 6. Serializer Changes

- `AccessInfo` serialization needs to handle `unlock_methods` as a list instead of `unlock_method` as a string
- Store serializer updates accordingly

### 7. Frontend Impact

- Store item cards: show "Buy for X" AND "Or subscribe" when `unlock_methods` contains both
- Coach admin pricing dropdown: remove "subscription" option, just "free" or "paid"
- Anywhere reading `unlock_method` (singular) needs to read `unlock_methods` (list)

## What Does NOT Change

- `SubscriptionPlanAccess` model — unchanged
- `SubscriptionPlan` model — unchanged
- `Subscription` model — unchanged
- `Payment`/`PaymentItem` models — unchanged
- `Bundle`/`BundleItem` models — unchanged
- Subscribe endpoint — unchanged
- Payment initialize endpoint — unchanged (already validates `pricing_type == "paid"`)
- Plan management views — unchanged

## Migration Strategy

1. Schema migration: update `pricing_type` choices on all 6 models
2. Data migration: `UPDATE ... SET pricing_type='paid' WHERE pricing_type='subscription'`
3. No `SubscriptionPlanAccess` records need changing
