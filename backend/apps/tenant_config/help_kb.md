# Ask Contentor — coach help knowledge base

Audience note for the assistant: the reader of your answers is a **coach** — the owner of a site on Contentor. Coaches are non-technical. Give UI steps, never technical jargon, API paths, or code. "Your site" = the coach's own subdomain (e.g. `yourname.contentor.app`). "Admin" = the coach's admin area at `/admin` on their own site. Students are the coach's customers.

## What Contentor is

Contentor is a platform where a coach gets their own branded website on a personal subdomain (custom domain possible via support) and sells to their students:
courses (video lessons), downloads (digital files), live sessions, and memberships/bundles — plus a community feed, email campaigns, announcements with push notifications, and a two-way email inbox.
The coach pays Contentor a monthly plan (Starter or Pro, after a 14-day Starter trial; coaches who joined before 16 October 2026 may still be on Free); students pay the coach directly through the coach's connected Stripe account, and Contentor keeps a small commission per sale.
Students sign in on the coach's site with a passwordless email link or Google — no passwords.
The coach runs everything from the admin area on their own site.

## Plans & pricing (exact, monthly)

| Plan | Price (USD) | Price (EUR) | Students | Storage | Live streaming | Campaign emails/mo | AI blog posts/mo | Commission on student sales |
|---|---|---|---|---|---|---|---|---|
| Free | $0 | €0 | 10 | 1 GB | Not available | 100 | 0 | — (cannot sell paid content) |
| Starter | $19.90/mo | €19.90/mo | 100 | 100 GB | 100 hours/mo | 1,000 | 5 | 8% |
| Pro | $49.90/mo | €49.90/mo | 500 | 500 GB | 500 hours/mo | 5,000 | 30 | 6% |

- Billing is monthly, via Stripe. Currency (USD or EUR) is set from the coach's country at signup and cannot be changed later.
- **New coaches start with a 14-day free Starter trial** (no Free plan since 16 October 2026). The card is added at checkout before the site is created (every new site gets its own trial) and is first charged when the trial ends, unless the coach cancels before. The trial runs everything in Starter except selling: paid content waits until the plan starts. **Start my plan now** (Settings → Your plan) ends the trial early to sell right away.
- **No plan, site paused**: if a trial is cancelled or a plan ends, visitors see a "back soon" page and the admin opens on the plan picker. Nothing is deleted; choosing a plan brings the site back at once.
- The Free plan (only for coaches who joined before 16 October 2026) **cannot make money**: no paid content, no student payments, no payouts, no live sessions. Selling requires an active Starter or Pro subscription plus completed payout setup (see Payouts & billing).
- Commission is Contentor's cut of each student payment (8% Starter, 6% Pro). The rest goes to the coach.
- Upgrade: open **Settings → Your plan**, choose the plan, complete checkout. Downgrading requires contacting support.
- Cancel: from the same Settings → Your plan page (**Cancel trial** / **Cancel plan**; it ends when the trial or the paid month ends, and **Keep my plan** takes it back). If payment fails, the subscription becomes "Past due"; after a grace period the plan ends (Free for coaches who still have it, a paused site for everyone else).
- Do not quote any other price, limit, or percentage than the table above.

## Courses

What: video courses built as Course → Modules → Lessons. Each lesson plays a video and/or shows text content. Courses can be free or paid (one-time price), and can additionally be included in membership subscription plans or bundles.

- **Create a course**: open Courses, click to create a new course. Add a title, description, thumbnail, and price (free or paid). Then add modules and lessons; attach videos from Media (under Site), or upload new ones.
- **Publish a course**: a course stays a draft until you mark it published; only published courses appear on your site.
- **Sell it two ways at once**: set a one-time price on the course AND include it in a subscription plan (Money → Store → Memberships). Students can then either buy it once or subscribe.
- **Track student progress**: students' lesson completion is tracked automatically; see who is enrolled per student in Students.
- Gotchas: paid courses require a paid Contentor plan + payout setup before students can actually buy. Demo/example courses seeded at signup should be removed before launch (see Setup checklist).

## Downloads (digital products)

What: sellable or free downloadable files (PDFs, worksheets, plans, guides).

- **Add a download**: open Downloads, upload the file, set title and price (free or paid).
- **Sell in a membership**: like courses, a download can also be attached to a subscription plan or a bundle.
- **Where students get it**: on your site's store; after purchase (or free claim) they can download the file.
- Gotchas: same monetization rule — paid downloads need a paid plan + payouts connected.

## Live sessions

What: every class and event is on one page, Classes & events (under Teach), in one list. "Where it happens" is a field of the event, with four choices:

1. **Live class** — interactive video call with chat, runs right in the browser (no extra software). Can record automatically.
2. **Live stream** — one-way broadcast to your students (you present, they watch).
3. **Zoom** — an event that links out to a Zoom meeting you host on Zoom.
4. **In person** — an event at a place, with an address and a number of places.

- **Schedule one**: open Classes & events and click "New class or event". Choose where it happens, give it a title and a date and time; it can be free, paid, or (live classes and in-person events) members only. Leave the date empty to keep it as a draft students do not see. Where it happens cannot be changed after it is created.
- **Or describe it**: the line above the list ("Describe a class or a series…") lets the assistant draft one class or a whole weekly series for you to confirm.
- **The list**: Upcoming and Past, nearest first, with search, tags and sorting. Each row shows when, where and the price.
- **Edit**: click Edit on its row. A date, a price or the number of places can be cleared as well as changed.
- **Run a live class or stream**: click "Go live" on its row when you are ready; "End" stops it. A Zoom event has "Open Zoom" instead.
- **Calendar**: switch from List to Calendar on the same page to see classes, emails and blog posts by date; click an item and "Manage" to open it.
- **Delete**: tick the events and choose Actions → Delete. Only the site owner can delete a class or event.
- Gotchas: live video (Live Class / Live Stream) is **not available on the Free plan** — it needs Starter or Pro. Streaming time counts against your plan's monthly hours (100h Starter / 500h Pro).

## Community

What: an optional community feed on your site where you and your students post and interact.

- **Turn it on/off**: open Community → Settings tab and flip the Community switch. You can also set a welcome message and choose whether students get notified when you post.
- **Moderate**: the Community page has a Feed tab (see and manage posts), a Reports tab (reported content and posts awaiting approval — a badge shows the pending count), and a Members tab (manage participants).
- **Post as the coach**: post from the feed; optionally students are notified of your posts.
- Gotchas: keep an eye on the Reports tab — items there wait for your decision.

## Designed emails (campaigns)

What: designed marketing/newsletter emails sent to your students, with delivery tracking. They live under Messages (Reach out), beside ordinary messages.

- **Send one**: open Messages and click "Design an email". Pick a template (or start from scratch), design it in the built-in visual editor, then choose the recipients and send or schedule it.
- **Templates**: Messages → Templates tab → "Templates for designed emails".
- **Results**: every designed email is in the Messages list with how many were delivered; click it for the recipient-by-recipient result. A scheduled one can be cancelled from the list.
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
- **Your own bill to Contentor**: managed separately in Settings → Your plan (see Plans & pricing). Don't confuse the two: Your plan = what you pay Contentor; Payouts = how student money reaches you.
- The Store page (Money → Store) has three tabs: **Products**, **Bundles** and **Memberships** (see below).

### Memberships (subscription plans) and bundles

- **Subscription plan** = a membership tier you define (name + recurring price) that grants access to a set of your content. Manage in Store → Memberships; attach courses, downloads, or sessions to the plan.
- **Bundle** = a one-time-purchase discounted group of content items. Create in Store → Bundles.
- Any paid item can be sold both individually and inside a plan/bundle at the same time.

## Custom domains

What: replacing `yourname.contentor.app` with your own domain (e.g. `www.yourname.com`), which also unlocks a branded email address (e.g. `info@yourname.com`) for the Inbox.

- **How to get one**: contact support at support@contentor.app — custom domains are set up with the support team; there is no self-serve screen for this yet.
- Your default address `yourname.contentor.app` always works.

## Website / page builder + Design & branding

One place: Edit site. It opens your real site with an editor panel on the left, with two tabs — **Pages** (the content of the page you're on) and **Site** (Brand and Navbar, which apply everywhere). Changes save automatically.

**Pages** (site content): your site has six pages — Home, About, Programs (courses), Pricing, FAQ, and Contact. Pick a page at the top of the Pages tab, then add, reorder, and edit its content blocks while seeing your real site. Selecting a block scrolls the site to it. (The Pricing page shows on your site under "Plans".)

**Site → Brand** (look & feel):
- **Look**: your site's layouts, colours and fonts come as one look. "Change look" shows the same looks the setup interview offered, each in its colourways; pick one and every page takes it, keeping its content. There is also a dark-mode toggle for visitors.
- **Logo**: upload your logo, or open the **Logo Studio** from the Brand section to create one visually.
- **AI Brand Pack**: inside the Logo Studio, paid plans can generate an AI-assisted brand pack (logo directions/branding). Free plans see an upgrade prompt; generation has a usage allowance.
- Your choices apply to your whole site and to branded emails.

## Media (photos and videos)

- **One page**: open Media (under Site). It has a Photos tab and a Videos tab and one upload area for both: drop files anywhere on the page, or click the upload area to choose them. A picture becomes a photo, a video becomes a video; several files at once is fine.
- **Videos**: large files are fine — a video uploads in parts and retries by itself if the connection drops. Videos are reusable: attach one to any lesson.
- **Photos**: used for course thumbnails, event covers, and branding.
- **Editing and deleting**: the pencil on a photo or video edits its title and tags. To delete, tick it and choose Actions → Delete (it asks first).
- **Storage**: media counts against your plan storage (1 GB Free / 100 GB Starter / 500 GB Pro).

## Messages (announcements)

What: what you tell your students — in their app, and by email if you want. Everything is on one page: Messages (under Reach out).

- **Send a message**: open Messages and click "New message". Write it (rich text), check "Who gets it", and send now, schedule it, or make it repeat. It lands in students' in-app feed; students who enabled push notifications also get a push on their device — the composer shows how many people you'll reach.
- **Also by email**: tick "Also send it as an email, in your brand" in the composer.
- **Only some students**: open "Only some students" under "Who gets it" to narrow by device or by who has phone notifications on.
- **One list**: Messages lists everything sent or scheduled, ordinary messages and designed emails together, newest first, with how many students it reached. Cancel a scheduled one, or delete a sent message (it also disappears from students' app).
- **Drafts from the assistant**: a message the assistant drafted shows in the list as a Draft with "Review & send". Nothing is sent until you send it.
- **Templates**: save and reuse message templates (Templates tab).
- **Repeating**: messages that repeat automatically (Repeating tab), with pause and delete.

## Settings

Open Settings for:
- **Language & region**: the default language new students see on your site (each student can override it), and your timezone.
- **Mailbox / email address**: claim or change your studio email address (see Inbox / Mailbox).
- **Remove demo content**: if your site was seeded with example content, remove it all from here (or from the setup guide). The dialog lists exactly what will be removed (example courses, downloads, live sessions, plans, bundles, videos, photos); anything you've edited is kept.

## Your assistant (in the admin)

What: one assistant panel in the admin, opened with the **Assistant** button in the top bar. Tabs: Assistant (chat), Setup (the checklist), Help (questions about Contentor), History (what it changed).

- **It knows the page you are on**: on a course's page "add a module to this course" changes that course; each page suggests a few things to ask.
- **Describe it**: on Courses, New course and Classes & events there is a one-line field. Describe a course ("a 4-week beginner course on breathing for runners") or a class or series ("a live flow class every Tuesday at 18:00 for 6 weeks") and it drafts it. You review a card and press Apply; nothing is created before that. The normal form stays available.
- **What it can do**: draft a course with modules and lessons; add, rename or remove modules and lessons of an existing course; schedule live classes, live streams, Zoom classes and in-person events; draft blog posts and announcements (it never sends anything); set covers, logo and page content. Class times are read in your time zone (Settings → General).
- **Search**: type a question in the admin's search box and choose "Ask the assistant".
- **Undo**: a draft it created can be taken back from its card or from History while you have not changed or published it. Changes to your site's pages can be undone from History, newest first.
- Gotchas: a turn takes a few seconds. It will not delete a lesson that has a video or student progress; remove those from the course page.

## Setup checklist (the setup guide)

A checklist ("Get your studio live") shown in the admin until your site is fully set up. Groups and items:

**Your site**
- *Home / About / Programs / Pricing / FAQ / Contact page*: open each page in the builder (via the checklist row or Edit site) and make it yours. An item completes once you've edited that page.
- *Pick your look*: open Edit site → Site → Brand, choose colors/font and set a logo (the checklist opens the Logo Studio directly). Completes when a logo is set or the look has been edited.

**Your content**
- *Create your first course*: create a course (or a download) of your own — the seeded examples don't count.
- *Remove the demo content* (only if your site was seeded): click the row to open the removal dialog. Completes when the demo items are gone.

**Getting paid**
- *Set up how you get paid*: open Payouts and complete Stripe payout setup (needs a paid plan). Completes when you can take payments.

**Go live**
- *Publish your site*: from Home's publish card. **Hard requirements before publishing**: a logo/look is set, demo content is removed, at least one course or download of your own exists, and — if you have paid content — payouts are connected. The publish card lists exactly what's missing. You can unpublish later (site hidden from students until republished).

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
- **How much does Contentor cost?** → Free $0; Starter $19.90/mo (€19.90); Pro $49.90/mo (€49.90). Monthly, via Settings → Your plan.
- **What's my commission/fee per sale?** → 8% on Starter, 6% on Pro. Nothing else per sale.
- **How do students find my page?** → Share your link: `yourname.contentor.app`. The setup guide's "Share your site" row copies it.
- **My student can't log in.** → They must sign in on YOUR site (not contentor.app) using the email link (check spam; link expires ~15 min — request a new one) or Google.
- **How do I refund a student?** → Students → click the student → payment history → Refund next to the item. The platform commission is not returned.
- **How do I remove the example content?** → Settings → Remove demo content (or the setup guide row). Edited items are kept.
- **Why can't I publish?** → The publish card lists what's missing: set your look/logo, remove demo content, create one own course or download, and connect payouts if you have paid items.
- **Can I use my own domain?** → Yes — contact support at support@contentor.app to set it up. It also unlocks a branded email address.
- **Can students email me?** → On a paid plan, yes: claim your address in Settings (e.g. `you@contentor.app`, or `info@yourdomain.com` with a custom domain). Mail lands in your Inbox. Free plan is send-only.
- **Do live classes need Zoom?** → No — Live Classes and Live Streams run in the browser. Zoom Classes are a separate option that links to your own Zoom meeting.
- **Why is live video greyed out?** → Live sessions need Starter or Pro; the Free plan has no live streaming.
- **How do I raise my student limit / storage?** → Upgrade the plan in Settings → Your plan (Starter: 100 students/100 GB; Pro: 500 students/500 GB).
- **Is there a student mobile app?** → Students install your site itself as an app (Add to Home Screen on iPhone Safari / Install app on Android) with push notifications.

## When you don't know

If the answer is not in this document, do not guess. Say you're not sure about that and suggest the coach email **support@contentor.app** for a definitive answer. Never invent prices, limits, percentages, features, or timelines — the only valid numbers are in the Plans & pricing section above, and the only valid features are the ones described in this document. If a coach asks about something described here as requiring support (custom domains, downgrades), point them to support@contentor.app directly.

## ROUTES

The ONLY links you may include in answers. Always link relative paths exactly as written (they open on the coach's own site).

| route | label | when to link |
|---|---|---|
| /admin | Home | Overview stats; the publish card lives here |
| /admin/courses | Courses | Managing or editing courses |
| /admin/courses/new | New course | Creating the first/next course |
| /admin/live | Classes & events | Scheduling live classes, streams, Zoom, in-person events; starting/stopping a broadcast |
| /admin/live?view=calendar | Calendar | Classes, emails and blog posts by date (a view of Classes & events) |
| /admin/live?new=1 | New class or event | Opens the form for a new class or event |
| /admin/downloads | Downloads | Adding or selling downloadable files |
| /admin/students | People | Student list, finding a student, refunds (via student detail) |
| /admin/community | Community | Enabling community, moderation, members |
| /admin/inbox | Inbox | Reading/answering student email, new message |
| /admin/messages | Messages | Everything sent or scheduled (announcements and designed emails), repeating messages, templates |
| /admin/messages/new | New message | Writing a message for the app, optionally also by email |
| /admin/messages/email/new | Design an email | Designing and sending a designed email (campaign) |
| /admin/messages/email/templates | Email templates | Templates for designed emails |
| /admin/payouts | Payouts | Connecting Stripe, payout status, earnings |
| /admin/store | Store | Products, bundles, memberships students can buy |
| /admin/store/bundles/new | New bundle | Creating a bundle |
| /admin/media | Media | Uploading and managing photos and videos (`/admin/media?type=videos` opens the Videos tab) |
| /admin/assistant | Student assistant | The chat helper students see on the site |
| /?edit=1 | Edit site | Editing the six site pages in the builder |
| /?edit=1&section=brand | Design | Theme, font, dark mode, logo, Logo Studio, AI Brand Pack |
| /admin/settings | General | Timezone, mailbox address, remove demo content |
| /admin/billing | Your plan | The coach's own Contentor plan and upgrade |
