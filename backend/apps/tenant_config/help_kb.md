# Ask Contentor — coach help knowledge base

Audience note for the assistant: the reader of your answers is a **coach** — the owner of a site on Contentor. Coaches are non-technical. Give UI steps, never technical jargon, API paths, or code. "Your site" = the coach's own subdomain (e.g. `yourname.contentor.app`, or `yourname.tr.contentor.app` in the Turkish region). "Admin" = the coach's admin area at `/admin` on their own site. Students are the coach's customers.

## What Contentor is

Contentor is a platform where a coach gets their own branded website on a personal subdomain (custom domain possible via support) and sells to their students:
courses (video lessons), downloads (digital files), live sessions, and memberships/bundles — plus a community feed, email campaigns, announcements with push notifications, and a two-way email inbox.
The coach pays Contentor a monthly plan (Free, Starter, or Pro); students pay the coach directly through the coach's connected Stripe account, and Contentor keeps a small commission per sale.
Students sign in on the coach's site with a passwordless email link or Google — no passwords.
The coach runs everything from the admin area on their own site.

## Plans & pricing (exact, monthly)

| Plan | Price (USD) | Price (TRY) | Students | Storage | Live streaming | Campaign emails/mo | Commission on student sales |
|---|---|---|---|---|---|---|---|
| Free | $0 | ₺0 | 10 | 1 GB | Not available | 100 | — (cannot sell paid content) |
| Starter | $19.90/mo | ₺999.00/mo | 100 | 100 GB | 100 hours/mo | 1,000 | 8% |
| Pro | $49.90/mo | ₺2,499.00/mo | 500 | 500 GB | 500 hours/mo | 5,000 | 6% |

- Billing is monthly, via Stripe. Currency follows the coach's region (global = USD, Turkey = TRY) and is locked at the first checkout.
- **Free plan cannot make money**: no paid content, no student payments, no payouts, no live sessions. Selling requires an active Starter or Pro subscription plus completed payout setup (see Payouts & billing).
- Commission is Contentor's cut of each student payment (8% Starter, 6% Pro). The rest goes to the coach.
- Upgrade: open **Billing → Subscription** tab, choose the plan, complete checkout. Downgrading requires contacting support.
- Cancel: from the same Billing → Subscription area. If payment fails, the subscription becomes "Past due"; after a grace period the site drops to Free.
- Do not quote any other price, limit, or percentage than the table above.

## Courses

What: video courses built as Course → Modules → Lessons. Each lesson plays a video and/or shows text content. Courses can be free or paid (one-time price), and can additionally be included in membership subscription plans or bundles.

- **Create a course**: open Courses, click to create a new course. Add a title, description, thumbnail, and price (free or paid). Then add modules and lessons; attach videos from the Videos library (or upload new ones).
- **Publish a course**: a course stays a draft until you mark it published; only published courses appear on your site.
- **Sell it two ways at once**: set a one-time price on the course AND include it in a subscription plan (Billing → Subscription Plans). Students can then either buy it once or subscribe.
- **Track student progress**: students' lesson completion is tracked automatically; see who is enrolled per student in Students.
- Gotchas: paid courses require a paid Contentor plan + payout setup before students can actually buy. Demo/example courses seeded at signup should be removed before launch (see Setup checklist).

## Downloads (digital products)

What: sellable or free downloadable files (PDFs, worksheets, plans, guides).

- **Add a download**: open Downloads, upload the file, set title and price (free or paid).
- **Sell in a membership**: like courses, a download can also be attached to a subscription plan or a bundle.
- **Where students get it**: on your site's store; after purchase (or free claim) they can download the file.
- Gotchas: same monetization rule — paid downloads need a paid plan + payouts connected.

## Live sessions

What: four kinds of live events, all managed from Live Events:

1. **Live Class** — interactive video call with chat, runs right in the browser (no extra software). Can auto-record; the recording lands in your Videos library.
2. **Live Stream** — one-way broadcast to your students (you present, they watch). Start/stop from the Live streams page.
3. **Zoom Class** — an event that links out to an external Zoom meeting you host on Zoom.
4. **On-site Event** — an in-person event with a location, address, and capacity.

- **Schedule a session**: open Live Events, pick the tab for the type, create it with a title, date/time, and duration. Sessions can be free or paid.
- **Run a live stream**: open Live streams, start the broadcast when ready, stop it when done.
- **Recordings**: live class recordings appear as videos you can reuse in lessons.
- Gotchas: live video (Live Class / Live Stream) is **not available on the Free plan** — it needs Starter or Pro. Streaming time counts against your plan's monthly hours (100h Starter / 500h Pro).

## Community

What: an optional community feed on your site where you and your students post and interact.

- **Turn it on/off**: open Community → Settings tab and flip the Community switch. You can also set a welcome message and choose whether students get notified when you post.
- **Moderate**: the Community page has a Feed tab (see and manage posts), a Reports tab (reported content and posts awaiting approval — a badge shows the pending count), and a Members tab (manage participants).
- **Post as the coach**: post from the feed; optionally students are notified of your posts.
- Gotchas: keep an eye on the Reports tab — items there wait for your decision.

## Email campaigns

What: designed marketing/newsletter emails sent to your students, with delivery tracking.

- **Design a template**: open Email → Templates and design your email in the built-in visual editor.
- **Send a campaign**: open Email → Compose, pick a template and the recipients, and send. Each campaign shows how many recipients it reached and how many sends succeeded.
- **Quota**: campaign emails are limited per month by plan — 100 (Free), 1,000 (Starter), 5,000 (Pro).
- Gotchas: campaigns go to your students' email addresses; recipients come from your student list. For a single personal message to one student, use the Inbox instead.

## Inbox / Mailbox (two-way coach email)

What: an email inbox inside your admin. You can always **send** email to students from the Inbox; whether students can **write to you** depends on your plan and domain:

- **Free plan, no custom domain**: send-only. You send from a default address; replies do not land in the Inbox. Upgrading unlocks your own address.
- **Paid plan (Starter/Pro), no custom domain**: claim your own address like `yourname@contentor.app` in Settings (Mailbox section). Mail students send to that address lands in your Inbox.
- **Custom domain**: pick a branded address on your own domain (like `info@yourdomain.com`) in Settings, with a switch to enable receiving. Student mail to it lands in your Inbox.

How-tos:
- **Read & reply**: open Inbox, pick a conversation, type a reply, send.
- **Write a new message**: Inbox → New message → enter the student's email, subject, and message.
- **Tidy up**: archive, mark as spam, or delete a conversation from its menu.
- **Get your address**: open Settings and find the Mailbox section; claim your address there (paid plans). If an address is taken or reserved, try another.
- Gotchas: getting a branded address on your own domain requires a custom domain — contact support to add one.

## Students

What: everyone who has signed up on your site. Students create themselves — on first sign-in (email magic link or Google) or first purchase they appear in your list automatically. You don't create student accounts manually.

- **See your students**: open Students — searchable list with each student's enrolled course count.
- **See one student's purchases**: click the student to open their payment history.
- **Refund a purchase**: in the student's payment history, click Refund next to the purchased item.
- **How students sign in**: on YOUR site (not contentor.app), they enter their email and receive a one-time login link, or use Google. The login link expires after about 15 minutes — if it doesn't arrive, they should check spam and request a new one.
- Gotchas: student capacity is per plan (10 Free / 100 Starter / 500 Pro). Students belong to your site only; they are not shared with other coaches.

## Payouts & billing (how you get paid)

What: student payments go through **your own Stripe account**, connected via "Stripe Connect". You are the merchant of record — money from student sales settles to your Stripe account, and Contentor automatically keeps its commission (8% on Starter, 6% on Pro).

- **Set up payouts**: open Payouts and click the connect button. You'll be taken to Stripe to enter your business/bank details, then returned. When Stripe enables charges on your account, you can take payments.
- **Check payout status**: the Payouts page shows whether you're connected, whether charges and payouts are enabled, and your earnings figures (including refunded totals).
- **Requirements to sell**: (1) active Starter or Pro subscription, and (2) completed Stripe payout setup. Without both, paid content can't be sold and the publish step will ask for payouts if you have paid items.
- **Refunds**: you issue refunds per purchased item from the student's payment page (see Students). Note: the platform commission is not returned on refunds.
- **Your own bill to Contentor**: managed separately in Billing → Subscription (see Plans & pricing). Don't confuse the two: Billing/Subscription = what you pay Contentor; Payouts = how student money reaches you.
- The Billing page also has: **Payments** tab (all student payments), **Bundles** tab, and **Subscription Plans** tab (see below).

### Memberships (subscription plans) and bundles

- **Subscription plan** = a membership tier you define (name + recurring price) that grants access to a set of your content. Manage in Billing → Subscription Plans; attach courses, downloads, or sessions to the plan.
- **Bundle** = a one-time-purchase discounted group of content items. Create in Billing → Bundles.
- Any paid item can be sold both individually and inside a plan/bundle at the same time.

## Custom domains

What: replacing `yourname.contentor.app` with your own domain (e.g. `www.yourname.com`), which also unlocks a branded email address (e.g. `info@yourname.com`) for the Inbox.

- **How to get one**: contact support at support@contentor.app — custom domains are set up with the support team; there is no self-serve screen for this yet.
- Your default address `yourname.contentor.app` always works.

## Website / page builder + Design & branding

Two separate admin areas:

**Pages** (site content): your site has six pages — Home, About, Programs (courses), Pricing, FAQ, and Contact. Open Pages, pick a page, and edit it in the live editor: add, reorder, and edit content blocks in the left panel while seeing your real site. Changes save automatically. (The Pricing page shows on your site under "Plans".)

**Design** (look & feel):
- **Theme**: choose one of six color themes — Ocean, Ember, Forest, Sunset, Violet, Slate — plus a dark-mode toggle and a font choice.
- **Logo**: set your logo, or open the **Logo Studio** from the Design page to create one visually.
- **AI Brand Pack**: inside the Logo Studio, paid plans can generate an AI-assisted brand pack (logo directions/branding). Free plans see an upgrade prompt; generation has a usage allowance.
- Your choices apply to your whole site and to branded emails.

## Photos / Videos / media

- **Videos**: open Videos to upload and manage your video library (large files are fine). Videos are reusable — attach one to any lesson; live-class recordings appear here too.
- **Photos**: open Photos to upload images used for course thumbnails, event covers, and branding.
- **Storage**: media counts against your plan storage (1 GB Free / 100 GB Starter / 500 GB Pro).

## Notifications & announcements

What: messages you push to your students in-app, optionally by email.

- **Send an announcement**: open Send announcement (Announcements), write your message (rich text), pick the audience with the filters, and send. It lands in students' in-app feed; students who enabled push notifications also get a push on their device — the composer shows how many people you'll reach.
- **Also send as an email**: tick "Also send as an email (uses your brand)" in the composer.
- **Templates**: save and reuse announcement templates (Templates tab).
- **Recurring**: schedule announcements that repeat automatically (Recurring tab).
- **History**: past announcements with details (History tab).

## Settings

Open Settings for:
- **Language & region**: the default language new students see on your site (each student can override it), and your timezone.
- **Mailbox / email address**: claim or change your studio email address (see Inbox / Mailbox).
- **Remove demo content**: if your site was seeded with example content, remove it all from here (or from the setup guide). The dialog lists exactly what will be removed (example courses, downloads, live sessions, plans, bundles, videos, photos); anything you've edited is kept.

## Setup checklist (the setup guide)

A checklist ("Get your studio live") shown in the admin until your site is fully set up. Groups and items:

**Your site**
- *Home / About / Programs / Pricing / FAQ / Contact page*: open each page in the builder (via the checklist row or Pages) and make it yours. An item completes once you've edited that page.
- *Pick your look*: open Design, choose colors/font and set a logo (the checklist opens the Logo Studio directly). Completes when a logo is set or the look has been edited.

**Your content**
- *Create your first course*: create a course (or a download) of your own — the seeded examples don't count.
- *Remove the demo content* (only if your site was seeded): click the row to open the removal dialog. Completes when the demo items are gone.

**Getting paid**
- *Set up how you get paid*: open Payouts and complete Stripe payout setup (needs a paid plan). Completes when you can take payments.

**Go live**
- *Publish your site*: from the Dashboard's publish card. **Hard requirements before publishing**: a logo/look is set, demo content is removed, at least one course or download of your own exists, and — if you have paid content — payouts are connected. The publish card lists exactly what's missing. You can unpublish later (site hidden from students until republished).

**Nice to have (optional)**
- *Add a download*, *Schedule a live session*, *Send an announcement* — one of each, via the matching admin pages.
- *Share your site* (appears after publishing): the row copies your site link to send to students.
- *Pick your studio email address* (paid plans): claim your address (see Inbox / Mailbox).

You can manually mark items done/undone, but manual marks never satisfy the hard publish requirements — those check real state.

## Student mobile app (install as an app / PWA)

Your site works as an installable app on students' phones — it opens full-screen like a native app and supports push notifications (for live classes, new lessons, and announcements).

- **iPhone**: student opens your site **in Safari**, taps Share, then "Add to Home Screen", then Add. Other iPhone browsers can't install it.
- **Android**: student taps the ⋮ menu, then "Install app" (or "Add to Home screen"), then Install.
- **Computer**: click the install icon in the browser's address bar.
- Students are prompted in-app to install and to turn on notifications; they can decline.
- There is no separate App Store / Play Store app — students install your site itself.

## Frequently asked

- **How do I get paid?** → Connect Stripe on the Payouts page; student payments settle to your Stripe account, minus Contentor's commission (8% Starter / 6% Pro).
- **Why can't I sell anything?** → Selling needs an active Starter or Pro plan AND completed payout setup on the Payouts page. Free plan can't sell paid content.
- **How much does Contentor cost?** → Free $0; Starter $19.90/mo (₺999); Pro $49.90/mo (₺2,499). Monthly, via Billing → Subscription.
- **What's my commission/fee per sale?** → 8% on Starter, 6% on Pro. Nothing else per sale.
- **How do students find my page?** → Share your link: `yourname.contentor.app` (or `yourname.tr.contentor.app` in Turkey). The setup guide's "Share your site" row copies it.
- **My student can't log in.** → They must sign in on YOUR site (not contentor.app) using the email link (check spam; link expires ~15 min — request a new one) or Google.
- **How do I refund a student?** → Students → click the student → payment history → Refund next to the item. The platform commission is not returned.
- **How do I remove the example content?** → Settings → Remove demo content (or the setup guide row). Edited items are kept.
- **Why can't I publish?** → The publish card lists what's missing: set your look/logo, remove demo content, create one own course or download, and connect payouts if you have paid items.
- **Can I use my own domain?** → Yes — contact support at support@contentor.app to set it up. It also unlocks a branded email address.
- **Can students email me?** → On a paid plan, yes: claim your address in Settings (e.g. `you@contentor.app`, or `info@yourdomain.com` with a custom domain). Mail lands in your Inbox. Free plan is send-only.
- **Do live classes need Zoom?** → No — Live Classes and Live Streams run in the browser. Zoom Classes are a separate option that links to your own Zoom meeting.
- **Why is live video greyed out?** → Live sessions need Starter or Pro; the Free plan has no live streaming.
- **How do I raise my student limit / storage?** → Upgrade the plan in Billing → Subscription (Starter: 100 students/100 GB; Pro: 500 students/500 GB).
- **Is there a student mobile app?** → Students install your site itself as an app (Add to Home Screen on iPhone Safari / Install app on Android) with push notifications.

## When you don't know

If the answer is not in this document, do not guess. Say you're not sure about that and suggest the coach email **support@contentor.app** for a definitive answer. Never invent prices, limits, percentages, features, or timelines — the only valid numbers are in the Plans & pricing section above, and the only valid features are the ones described in this document. If a coach asks about something described here as requiring support (custom domains, downgrades), point them to support@contentor.app directly.

## ROUTES

The ONLY links you may include in answers. Always link relative paths exactly as written (they open on the coach's own site).

| route | label | when to link |
|---|---|---|
| /admin | Dashboard | Overview stats; the publish card lives here |
| /admin/courses | Courses | Managing or editing courses |
| /admin/courses/new | New course | Creating the first/next course |
| /admin/downloads | Downloads | Adding or selling downloadable files |
| /admin/videos | Videos | Uploading/managing the video library, recordings |
| /admin/photos | Photos | Uploading images/thumbnails |
| /admin/live | Live Events | Scheduling live classes, streams, Zoom, on-site events |
| /admin/live-streams | Live Streams | Starting/stopping a broadcast |
| /admin/community | Community | Enabling community, moderation, members |
| /admin/email | Email Campaigns | Campaign list and delivery results |
| /admin/email/templates | Email Templates | Designing email templates |
| /admin/email/compose | Compose Campaign | Sending a campaign |
| /admin/inbox | Inbox | Reading/answering student email, new message |
| /admin/notifications | Announcements | Sending announcements, templates, recurring |
| /admin/students | Students | Student list, finding a student, refunds (via student detail) |
| /admin/billing | Billing | Coach's own plan/upgrade, payments list, subscription plans, bundles |
| /admin/billing/bundles/new | New bundle | Creating a bundle |
| /admin/payouts | Payouts | Connecting Stripe, payout status, earnings |
| /admin/pages | Pages | Editing the six site pages in the builder |
| /admin/design | Design | Theme, font, dark mode, logo, Logo Studio, AI Brand Pack |
| /admin/settings | Settings | Language/timezone, mailbox address, remove demo content |
