# Access: every way a student gets in, each with its own window

Status: design, written 2026-10-19 from the owner's request and answers in chat. Not built.
Build order: **after focus mode for every kind is finished** (owner's call; see §8).

## 1. Intent

A creator sells the same thing in several ways at once: bought once, included in one or more
subscriptions, free, or given to one student by hand. Any of those ways can be limited in time
("1 year of access", "members get it after their first month", "free until Sunday").

Today a sellable item has one "Pricing Type" dropdown (Free / Paid / Included in subscription),
which makes the creator pick one way. The owner wants:

- **Access as its own section** on each item, where every way in can be ticked together.
- **Time windows** on every way in, either counted from when that student got in or set as
  calendar dates.
- **The AI that creates things** (the assistant chat and focus mode) to understand what the
  creator is after, suggest the right combination, and set it up.

## 2. Where things stand (2026-10-19)

- The data already allows several ways at once. An item can be `paid` and also linked to any
  number of subscription plans (`SubscriptionPlanAccess`). The student paywall already offers
  "Buy now / get it in a bundle / subscribe" (`components/public/enroll-button.tsx`).
- The creator cannot see or set that from the item. Each form has the single dropdown:
  - `components/admin/course-form.tsx`
  - `components/admin/live/event-form.tsx`
  - `app/admin/downloads/page.tsx`

  Plan links are edited only on `app/admin/store/plans/[id]/page.tsx`. The two drift apart. On
  prod, `mirats-pole-dance-studio` has three memberships (€9, €19, €49) whose only linked item is
  a course marked Free, so they sell nothing.
- The AI paths disagree:
  - `/setup` already asks "Tick every way in" (`interview_brief.access_options`, written by
    `interview_milestones.apply_access`).
  - Focus mode's access step is a single pick (`focus/flow.py: _price_tiles`, `_access`).
  - The assistant can only set a price (`copilot/content.py: edit_course`, `create_event`), and
    a price edit there turns a members-only item into a paid one.
  - The assistant does not see the creator's subscription plans.
- No time limits exist anywhere. A purchase is forever and a subscription opens access while
  `status="active"` and `current_period_end > now`. Nothing unlocks later.
- `pricing_type="subscription"` with no plan linked means "every subscription unlocks it". No item
  on prod uses this.
- Live streams cannot be members-only (their model has no `subscription` choice). A paid Zoom
  class cannot be bought (billing's content maps leave Zoom out).
- No real student payment has gone through on prod yet (0 Stripe payments on any site), so
  changing how access is stored is cheap now.

## 3. Goals, non-goals, anti-goals

**Goals**
1. One **Access** section on every sellable item, replacing the Pricing Type dropdown. Any
   combination of ways in can be ticked there.
2. A **window** on every way in (bought once, in a subscription, free, given by the creator).
   Each bound is either relative (N days after that student got in) or a calendar date.
3. Students see the terms before paying ("€49 · 1 year of access") and their own state after
   ("Your access ends on 19 Oct 2027", "Opens for you on 2 Nov").
4. One shared description of access (the **ways**, §5.4) used by every writer: the Access
   section, focus mode, the assistant and /setup.
5. The assistant and focus mode read the creator's goal and their existing setup, propose a
   combination with a one-line reason, and set it on the creator's confirmation.

**Non-goals** (not in this project)
- Selling Zoom classes. They stay free, as the focus-mode plan decided (G9).
- Bundles inside subscriptions, or bundles of bundles.
- Members-only blog posts and a members-only community.
- Coupons, discount codes, and price changes over time (other than a free window).
- "Give access" for anything other than courses.
- Retiring an item (stop selling it while buyers keep access) and sales windows ("on sale until a
  date"). Windows here are on access, not on sale.
- Refund and dispute webhooks, and the other payment flags found during research. They are
  tracked separately.

**Anti-goals** (failure even if it works)
- The simple case gets slower. "Free" or "sell it for €29" must stay one tick plus a price.
- A later edit cuts short what a student already bought.
- The AI invents a price or a subscription the creator never set.

## 4. Decisions made by the owner (2026-10-19)

| Question | Answer |
|---|---|
| Where Access lives | A section on each item's page. A subscription's own page keeps its "What's included" list, which is the same data seen from the other side. |
| What "access will be invoked after a month" means | "The access itself to the content could be within some window." |
| What a window counts from | Both: from when each student got in, and calendar dates the same for everyone. |
| Which ways in can have a window | All four: bought once, in a subscription, free, given by the creator. |
| Order against focus mode for every kind | Focus mode first; this is built afterwards. |
| The two bugs found ("Give access" left lessons locked; bundles looked owned and could be bought twice) | Fixed now, separately. Done 2026-10-19 in `9af3bdf7` (`Bundle.pricing_type = "paid"`) and `f56b9857` (`Enrollment.granted`). |

## 5. Design

### 5.1 Ways in and windows

A **way in** is one route to an item. Each way has an anchor, "the moment this student got in":

| Way | Who | Got in at |
|---|---|---|
| Bought once | anyone who pays the item's price | the moment the payment completed |
| In a subscription | members of a ticked plan | when their subscription started (`Subscription.created_at`) |
| Free | everyone | when they joined the site (`User.date_joined` in the tenant) |
| Given by the creator | one student, from the student drawer | the moment it was given |

A **window** has two bounds. Each bound is empty, relative or a calendar date:

- **opens:** right away (empty) · after N days from got-in · on a date
- **closes:** never (empty) · after N days from got-in · on a date

Calendar dates are read in the creator's time zone (`TenantConfig.timezone`). "Opens on" means
the start of that day and "closes on" means the end of it. Days are the stored unit. The UI offers
presets (1 week, 1 month = 30 days, 3 months, 6 months, 1 year = 365 days) and a custom number.

Through a way, a student has access while the window is open for them. An item is open to a
student if any of its ways is open for them. The creator, the owner and coaches always have access,
as today.

Rules, my calls:
- **A purchase keeps its terms.** The window is stamped on the purchase when the payment completes.
  Editing the item later never changes a purchase that already exists.
- **Subscription and free windows are live.** An edit applies to everyone at once, including
  members who already have access (a later "opens after" can close it again for them). The
  control says so in one line. This matches today, where taking an item out of a plan closes it
  for members straight away.
- **At least one way is always ticked.** A new item starts as Free, as today, and unticking the
  last way is refused with a hint. Drafts are hidden by their own draft state, so they need no
  "nothing ticked" state.
- **Free with no window covers everyone,** so the other ways do nothing while it is ticked. The
  section shows them greyed with a one-line note, and keeps their settings. A free *window* can sit
  beside other ways, for example "free until Sunday, then €29".
- **A bundle's purchase window covers every item reached through that bundle.**
- **Buying again** is allowed once a purchase's window has closed. While a purchase is open, or
  bought but not yet open (a pre-sale), checkout refuses a second one as it does today.
- **A member still waiting** (window not yet open) sees when it opens, and can still buy the item
  if it is sold on its own.

### 5.2 What students see

On the paywall, each unlock option shows its terms:
- "€49 · 1 year of access"
- "Included in Gold · opens after 30 days of membership"
- "Free until 30 Nov"

Once they have access, where the course, download or event shows access today, it also shows:
- "Your access ends on 19 Oct 2027" when it closes, or
- "Opens for you on 2 Nov" while a member is still waiting.

When a window has closed, the item returns to its paywall with "Your access ended on …" and the
ways still open to them.

`AccessInfo` (`apps/core/access.py`) gains `access_ends_at` and `opens_at` (both nullable), and
`get_unlock_options` gains each option's window, so the frontend has the dates above. The exact
wording is left to the builder.

### 5.3 The Access section (creator)

It replaces the Pricing Type dropdown and price box on the course, download and live-event forms
(live, stream, in-person). On a Zoom class it shows Free only, with the line "Zoom classes are free
to join". On the bundle page it shows the price plus the bought-once window. Sketch:

```
Access
How students get this. Tick every way in.

[x] Sell it once         €[ 49 ]    Access: [Forever ▾]        (+ opens later)
[x] In subscriptions
      [x] Gold · €19/month    Opens: [Right away ▾]  Closes: [Never ▾]
      [ ] Silver · €9/month
      + New subscription
[ ] Free                  [Always ▾]  (always / until a date / for the first N days after joining)

Also in bundles: Starter pack (€79) ›
```

- Window controls stay collapsed to one short line ("Forever", "Right away · never") until opened.
  The simple case looks like today: tick, price, save.
- Validation: selling it once needs a price above 0, "In subscriptions" needs at least one plan
  ticked, and at least one way stays ticked (§5.1).
- Who can change what follows today's rules. Which subscriptions include an item, and a bundle's
  terms, are owner-only (`plans.py: plan_access` and the bundle writes check `IsOwner`). A coach
  who is not the owner sees the subscriptions read-only and can change Free, Sell it once and the
  windows. `set_ways` enforces the same split, so it also binds the assistant, which runs for
  coaches too.
- "+ New subscription" goes to the membership flow (focus mode stage E once it exists, otherwise
  `/admin/store/plans/new`).
- The subscription page's "What's included" list shows each item's window as a short line. A save
  there adds and removes links but keeps the windows on the links it keeps.
- The student drawer's "Give access" gains "For how long": forever, 1 month, 3 months, 1 year, or
  until a date.

Follows the root `CLAUDE.md` loading and feedback conventions (`useAsyncAction`, toasts, inline
field errors).

### 5.4 One shared description: the ways

Every writer and reader speaks one structure:

```json
{
  "free": {"window": null},
  "buy": {"price": "49.00", "window": {"closes_after_days": 365}},
  "plans": [{"plan_id": 3, "window": {"opens_after_days": 30}}]
}
```

A window is `{opens_after_days?, opens_on?, closes_after_days?, closes_on?}`, with at most one of
each pair. `free`, `buy` or `plans` may be null or empty.

One module owns it (suggested: `apps/billing/ways.py`):
- `ways_of(item) -> dict`
- `set_ways(item, ways)`: idempotent and transactional; validates, writes everything in §5.5, and
  derives `pricing_type`.
- `describe(ways) -> str`, the plain words the assistant and focus mode say back ("€49 once with
  1 year of access; in Gold after 30 days").

API: `GET` / `PUT /api/v1/admin/access/<kind>/<id>/`, coach or owner, the same for every kind. The
Access section loads and saves through it. On a new item it saves right after the item is created,
as the subscription page saves its plan and then its access.

Callers move onto `set_ways`:
- focus mode's adapters (`set_price` / `put_in_plan` become one write)
- the assistant's actions
- `/setup`'s `apply_access`
- the weekly series copy (`apps/live/series.py`), which copies the first session's ways

### 5.5 What is stored (my calls)

- `pricing_type` and `price` stay on the items, because about 30 files read them. They become a
  headline that only `set_ways` writes:
  - `paid` = sold on its own
  - `subscription` = in subscriptions but not sold on its own
  - `free` = neither, so the free way is the one ticked; it may carry a window

  `LiveStream` gets the `subscription` choice (migration). Zoom is unchanged.
- **Only `ContentAccessService` decides access.** Every place that grants access from
  `pricing_type == "free"` without asking it must ask it instead, because a free window can close.
  The places found in research:
  - `live/serializers.py:15-29` (`_viewer_has_access`)
  - `notifications/services.py:169`
  - the anonymous fallbacks in the course, download and live serializers
  - `live/views.py:~550`
  - `billing/views/store.py: _unauthenticated_access_info`
- **New `AccessWindow`** (tenant schema, billing app): `content_type` + `object_id` (the item),
  `way ∈ {free, buy}`, and the four optional bounds. Unique per (item, way). No row means no window.
  A `free` row on an item whose headline is `paid` or `subscription` is its free window.
  Bundles use it for their bought-once window.
- **`SubscriptionPlanAccess`** gets the four bounds and is read live.
- **`PaymentItem`** gets `access_starts_at` and `access_ends_at` (both nullable). They are stamped
  in `grant_access_for_payment` from the item's or bundle's `buy` window at that moment. That
  function covers both bypass and the Stripe webhook.
- **`Enrollment`** rows with `granted=True` (added 2026-10-19) get the same two fields, set from the
  drawer's "For how long".
- Drop the hidden "subscription with no plan linked means every subscription" rule. No prod item
  relies on it. A data migration links any such item to every active plan, so its behaviour does
  not change.
- Existing links on free items (mirats, carequeen) stay as they are. While Free is ticked they do
  nothing. If the creator unticks Free, the item becomes members-only in those subscriptions,
  which is what they set up.

Fold these flags from research into the paywall rewrite, since they live in the same checks:
- an item whose only plan is off sale flips to "any subscriber" (`_is_in_any_plan` counts only
  active plans); this goes away with the rule above
- the subscription duplicate check ignores `current_period_end`

### 5.6 The AI

All three paths use the ways (§5.4) and `describe()`.

**Assistant chat (`apps/core/copilot`)**
- Context: the creator's subscription plans (id, name, price, cycle, on sale or not, number of
  items), and each listed course, event and download's ways in short form.
- Action `set_access {kind, id, ways}`: one card in plain words; the creator confirms; it goes
  through `set_ways` and the existing audit trail and undo. `create_course` and `create_event` take
  an optional `access` (ways); `price` stays as a shorthand for bought once.
- Price edits (`edit_course`, `edit_event`) change only the bought-once price, through `set_ways`.
  They never change the other ways.
- Prompt guidance, from the creator's goal to a setup, always with a one-line reason:

  | Goal | Setup |
  |---|---|
  | Steady monthly income | In a subscription |
  | Sell to everyone and reward members | Bought once and in a subscription |
  | A programme with an end | Bought once with 3–12 months of access |
  | Keep members subscribed | In a subscription, opening after N days |
  | Grow the list | Free |
  | A launch push | A free or calendar window |
- A price only ever comes from the creator's numbers or words (focus mode's F11 rule). It never
  invents a plan. When the best setup needs a subscription they don't have, it offers to start
  one in focus mode (the assistant can already open focus mode).

**Focus mode (`apps/core/focus`)**, done after the every-kind work ships
- The access step becomes "How will students get it? Tick every way in" for every kind that is
  sold, in the same multi-select style as /setup. Tiles:
  - Free
  - Sell it once, with the suggested price and its reason (code, from the creator's numbers, as
    today)
  - each subscription plan
- The suggestion pre-ticks the combination the creator's other items of that kind use most. With
  none, it pre-ticks bought once at the suggested price, with a reason line naming what it copied.
- A window is asked only if the creator's words mention time, or they tap "Add a time limit".
  "€49 once, free for Gold members after their first month" fills everything in one go, read by
  the existing typed analysis extended to ways.
- The finish step's "cannot sell" check (`cannot_sell`) covers every paid way, including
  subscriptions, which it misses today.

**/setup** keeps its questions. `apply_access` writes through `set_ways`. It asks nothing about
windows, to keep onboarding short (my call).

## 6. Constraints

- **Shared checkout:** other agent sessions commit to `main` and run tests on the same stack.
  Stage by path, run one heavy job at a time, and check for a running test or e2e job first.
- `apps/core/access.py` is shared runtime code with HIGH impact (14 direct callers). Run
  `make test-changed`, which runs the full backend suite here, plus the e2e specs it selects.
- After serializer changes, run `npm run gen:api` and review the diff.
- No new dependencies. Follow the copy rules for creators: plain words, no codes or ids.

## 7. Left to the builder

- The exact layout and wording of the Access section, the paywall lines and the drawer, within
  §5.2–5.3.
- Table and field names, beyond the shapes above.
- How the frontend shares the section between the forms. One component is expected.
- How "My courses" shows a course whose access has ended (hidden, or shown as ended).
- The order of steps inside the build plan.

## 8. Coordination with focus mode

Focus mode for every kind (plan `docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md`) is
being built now, with the single-pick access step. The owner chose to let it finish first. This
project then:
- moves every kind's access step to the multi-select of §5.6
- replaces the adapters' `set_price` / `put_in_plan` with `set_ways`

Write the build plan when **every** stage of that work has shipped (C–G, not only events),
against the code as it is then. Three reasons:
- Stage D replaces the download form, which today is the inline card on
  `app/admin/downloads/page.tsx`, with `download-form.tsx`.
- Stage E builds the membership flow that "+ New subscription" opens.
- Stages D and F add the draft states (`is_published`) for downloads and bundles.

Both projects also edit `focus/flow.py` and `get_access_info`.

## 9. How we know it works

1. From one item's page, in one save, a creator sells it once at €49 with 1 year of access and
   includes it in two subscriptions where it opens after 30 days.
   - A new buyer's purchase carries an end date a year out. It stays the same when the creator
     later changes the price or the bought-once window.
   - A new Gold member sees "Opens for you on <date>". That date moves if the creator changes the
     Gold window, because subscription windows are live.
2. A free window ("free until 30 Nov") opens the item to everyone until the end of 30 Nov in the
   creator's time zone, then shows the paywall.
3. "Give access for 1 month" opens a paid course for that student for 30 days.
4. Asked "I want my course to bring monthly income but also sell it to people who don't want a
   subscription", the assistant proposes bought once plus the creator's existing subscription,
   with a reason, and sets it on confirmation without inventing a price.
5. In focus mode, "€49 once, free for Gold members after their first month" fills the Access
   section exactly.
6. Existing items keep their access unchanged after the migrations.
