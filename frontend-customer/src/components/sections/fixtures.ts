/**
 * Showcase fixtures: realistic content at the LONGEST and SHORTEST sizes each
 * family allows, plus sample courses / plans / events for dynamic families.
 * Photos are Pix4Less catalog previews (public, non-expiring web renditions).
 */
import type { FamilyId } from "@shared/sections/types";
import type { Block } from "@/types/tenant";
import type { Course } from "@/types/course";
import type { CalendarEvent } from "@/types/live";
import type { SubscriptionPlan } from "@/types/billing";

const px = (id: string) => ({
  url: `https://pix4less.com/media/previews/${id}/web.webp`,
  photo_id: null,
});

export const FIXTURE_PHOTOS = {
  teaching: px("a49eb7b9-08e0-4e64-abb2-778f98c61754"), // warrior II, sunlit studio (landscape)
  teaching2: px("9cbcdeae-3007-4050-a8f8-9ab49b9e9648"), // tree pose (landscape)
  acro: px("6e060aff-e1a7-4e2e-a98e-aa6cff20cda0"), // partner acro (landscape)
  portrait: px("e265f398-ea48-44e9-b479-9c053f1a576a"), // lotus, bright studio (portrait)
  portrait2: px("3554117f-6527-4ca6-b0e1-4d373d87fb22"), // balancing, wooden studio (portrait)
  stretch: px("5c2dba6b-092f-4be6-bb41-4c97d1d34bd5"), // stretching (portrait)
  meditate: px("a841d303-4daf-4a69-b89a-d8367d53c315"), // warm minimalist room (portrait)
  meditate2: px("44b228ba-d236-4f72-abfb-a84c3f0d2028"), // cushion (portrait)
  detail: px("2b6216c1-f806-4f3f-b823-f74f4fb22317"), // butterfly pose (square)
  detail2: px("69803cc4-b809-49db-af8d-c30a3c85f390"), // cork mat (square)
  ocean: px("a736f4d7-bdef-4a05-86e5-273d48d7efd8"), // beside the ocean (square)
  garden: px("ee67f92b-f2b3-43ea-ab7b-0925ad81c6b4"), // tropical deck (square)
  trainer: px("fc4933c3-ebd7-45fb-8132-c3be41a8a09f"), // PT barbell (landscape)
  pilates: px("551ef32b-ebf6-45fd-8c0d-9e981e0a8fea"), // reformer (landscape)
  workshop: px("bdb37d1e-1d2b-4567-a347-7b82ff48458b"), // presenter (landscape)
  pottery: px("7164e49c-853f-4675-b3c2-701df691d12a"), // pottery lesson (portrait)
  man: px("32667b0c-6534-4ca5-99df-d126173c2ff6"), // man smiling, studio (portrait)
};

const P = FIXTURE_PHOTOS;

type Content = Partial<Block>;

const LONG: Record<FamilyId, Content> = {
  hero: {
    kicker: "Vinyasa & breathwork · Lisbon",
    headline: "Strength that feels like ease, one breath at a time",
    subhead:
      "Slow, intelligent flow classes for busy people who want to feel strong, open and calm again — online from anywhere or in my light-filled studio.",
    ctaLabel: "Start the 7-day course",
    ctaHref: "/courses",
    secondaryLabel: "Meet Maya",
    secondaryHref: "/about",
    meta: "Online & in-studio · All levels welcome",
    image: P.teaching,
    image2: P.detail,
  },
  story: {
    kicker: "Hello, I'm Maya",
    heading: "I teach yoga for people who think they're not flexible enough",
    body: "<p>I came to the mat at thirty-one with a sore back, a desk job and zero patience. What kept me there wasn't the poses — it was the hour where nothing else asked anything of me.</p><p>Today I teach the classes I wish I'd found then: unhurried, precise and kind. We build strength before we chase shapes, we breathe before we push, and we leave room for the days when rest is the practice.</p><p>Whether you join a live class or follow a course from your living room, you'll get clear cues, honest modifications and a teacher who answers your questions.</p>",
    signature: "Maya Laurent",
    ctaLabel: "Read my story",
    ctaHref: "/about",
    image: P.portrait,
    image2: P.teaching2,
  },
  benefits: {
    kicker: "Why students stay",
    heading: "A practice that fits the life you actually have",
    intro:
      "Every class is built around what changes in your body and your week — not around how many poses we can fit into an hour.",
    items: [
      { title: "Stronger, safer joints", text: "Progressive strength work protects shoulders, hips and lower back so flexibility comes without strain." },
      { title: "Calm you can carry", text: "Short breath practices you can use in a meeting, on a train or at 2 a.m. when sleep won't come." },
      { title: "Classes that meet you", text: "Every pose has an easier and a deeper option, so beginners and seasoned students share the same room." },
      { title: "Learn at your pace", text: "Recorded courses stay yours; pause, repeat and come back whenever your schedule allows." },
      { title: "Real feedback", text: "Ask questions under every lesson and get answers from me, not a support bot." },
      { title: "Small live groups", text: "Live classes are capped at twelve so I can see you, cue you and learn your name." },
    ],
    image: P.stretch,
  },
  courseShowcase: {
    kicker: "Courses",
    heading: "Start where you are, go as deep as you like",
    intro: "Self-paced programs you keep forever. Each one builds a real skill, with short daily sessions you'll actually finish.",
    ctaLabel: "See all courses",
    limit: "6",
  },
  howItWorks: {
    kicker: "How it works",
    heading: "From first class to a practice of your own",
    intro: "No pressure, no contracts. Pick the format that suits you and switch whenever your life changes.",
    steps: [
      { title: "Choose your path", text: "Start with a self-paced course or book a live class — both are designed for complete beginners." },
      { title: "Practise a little, often", text: "Twenty focused minutes, four times a week, beats one exhausting class. Your plan shows you what to do next." },
      { title: "Ask, adjust, repeat", text: "Leave a question on any lesson and get a personal answer, so you never practise a pose the wrong way." },
      { title: "Make it yours", text: "After a few weeks you'll build your own short sequences for mornings, travel days and hard nights." },
    ],
    image: P.meditate,
  },
  philosophy: {
    kicker: "What I believe",
    statement:
      "Flexibility is a side effect. The real practice is learning to stay with yourself — curious, steady and kind — when things get hard.",
    attribution: "Maya Laurent",
    image: P.ocean,
  },
  moments: {
    kicker: "Inside the studio",
    heading: "Moments from class",
    caption: "Morning flows, Sunday workshops and the quiet minutes after savasana.",
    photos: [
      { image: P.acro, caption: "Partner flow workshop" },
      { image: P.portrait2, caption: "Balance lab, Thursday" },
      { image: P.detail2, caption: "Sunday slow flow" },
      { image: P.garden, caption: "Retreat morning" },
      { image: P.meditate2, caption: "Breathwork circle" },
      { image: P.teaching2, caption: "Beginners' series" },
    ],
  },
  pricing: {
    kicker: "Membership",
    heading: "One membership, every class and course",
    intro: "Join live classes, follow every course and get new sessions each month. Cancel any time from your account.",
  },
  faq: {
    kicker: "Questions",
    heading: "Everything you want to know before your first class",
    intro: "Can't find your answer? Write to me — I reply to every message within a day.",
    items: [
      { q: "I've never done yoga. Is this really for me?", a: "Yes. Every course starts with the basics and every pose has a simpler option. Most of my students started exactly where you are." },
      { q: "What do I need at home?", a: "A mat and a quiet corner. A cushion and a strap help but a folded blanket and a belt work just as well." },
      { q: "How long are the sessions?", a: "Course lessons run 15–30 minutes. Live classes are 60 minutes including a slow warm-up and a proper rest at the end." },
      { q: "Can I practise with an injury?", a: "Often, yes — with care. Tell me about it before class and I'll suggest modifications, but always follow your doctor's advice first." },
      { q: "Do the courses expire?", a: "No. Once you join a course it's yours, including future updates to its lessons." },
      { q: "Can I switch between live and recorded?", a: "Any time. The membership covers both, so you can mix them week by week." },
      { q: "How do I cancel?", a: "From your account page in two clicks. You keep access until the end of the period you paid for." },
      { q: "Do you offer private sessions?", a: "A few each month. Send me a message with what you'd like to work on and I'll share available times." },
    ],
  },
  cta: {
    kicker: "Your first week is on me",
    heading: "Roll out your mat — your stronger, calmer self is twenty minutes away",
    text: "Start the free 7-day beginner course today. No card, no pressure, just one short session a day.",
    ctaLabel: "Start free today",
    ctaHref: "/courses",
    image: P.teaching,
  },
  contact: {
    kicker: "Say hello",
    heading: "Questions about a class, a course or a private session?",
    text: "Send me a message and I'll get back to you personally within a day. For studio classes, I'm in Príncipe Real, a five-minute walk from the metro.",
    email: "hello@mayalaurent.studio",
    location: "Rua da Escola Politécnica 42, Lisbon",
    hours: "Replies within 24 hours, Mon–Sat",
    showForm: true,
    image: P.portrait2,
  },
  events: {
    kicker: "Live",
    heading: "Upcoming live classes and workshops",
    intro: "Small groups, real-time cues and a few minutes for questions at the end. Join from home or the studio.",
    ctaLabel: "See the full calendar",
  },
};

const SHORT: Record<FamilyId, Content> = {
  hero: { headline: "Yoga for real life", image: P.teaching2, ctaLabel: "Start", ctaHref: "/courses" },
  story: { heading: "Hi, I'm Maya", body: "<p>I teach slow, strong yoga.</p>", image: P.portrait },
  benefits: {
    heading: "Why join",
    items: [
      { title: "Strength", text: "Build it safely." },
      { title: "Calm", text: "Breathe better." },
      { title: "Freedom", text: "Practise anywhere." },
    ],
  },
  courseShowcase: { heading: "Courses", limit: "3" },
  howItWorks: {
    heading: "How it works",
    steps: [
      { title: "Choose", text: "Pick a course." },
      { title: "Practise", text: "A little, often." },
      { title: "Grow", text: "Feel the change." },
    ],
  },
  philosophy: { statement: "Breathe first." },
  moments: { photos: [{ image: P.acro }, { image: P.detail }, { image: P.stretch }] },
  pricing: { heading: "Membership" },
  faq: {
    heading: "FAQ",
    items: [
      { q: "Beginners?", a: "Yes." },
      { q: "Equipment?", a: "Just a mat." },
      { q: "Length?", a: "20 minutes." },
    ],
  },
  cta: { heading: "Start today", ctaLabel: "Join", ctaHref: "/courses" },
  contact: { heading: "Contact", showForm: true },
  events: { heading: "Live classes" },
};

export function fixtureBlock(
  family: FamilyId,
  variant: string,
  size: "long" | "short",
): Block {
  const content = (size === "long" ? LONG : SHORT)[family];
  return {
    id: `fx_${family}_${variant.replace(/\W/g, "_")}_${size}`,
    type: `section.${family}`,
    variant,
    enabled: true,
    ...structuredClone(content),
  };
}

const course = (
  id: number,
  title: string,
  description: string,
  price: string,
  img: { url: string },
  lessons: number,
  pricing: Course["pricing_type"] = "paid",
): Course => ({
  id,
  title,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  description,
  instructor: 1,
  instructor_name: "Maya Laurent",
  thumbnail_url: img.url,
  thumbnail_signed_url: img.url,
  price,
  pricing_type: pricing,
  is_published: true,
  order: id,
  lesson_count: lessons,
});

export const FIXTURE_COURSES: Course[] = [
  course(1, "Yoga Foundations: Your First 30 Days", "Build a safe, strong base with four short sessions a week — alignment, breath and the poses everything else is built on.", "49.00", P.teaching2, 24),
  course(2, "Strong Spine, Calm Mind", "A posture and core program for desk workers: release the neck and lower back, then build the strength that keeps them happy.", "39.00", P.stretch, 18),
  course(3, "7-Day Beginner Reset", "Seven gentle sessions to start moving again. Free, short and kind.", "0.00", P.meditate, 7, "free"),
  course(4, "Breathwork for Better Sleep", "Evening breath and restorative practices that switch your nervous system off.", "29.00", P.meditate2, 10),
  course(5, "Arm Balances Without Fear", "Crow, side crow and beyond — progressive drills that make balancing feel inevitable.", "59.00", P.acro, 21),
  course(6, "Hips & Hamstrings Lab", "Twelve focused sessions that open tight hips and hamstrings without forcing.", "35.00", P.detail2, 12),
];

export const FIXTURE_PLANS: SubscriptionPlan[] = [
  { id: 1, name: "Monthly", description: "Every live class and every course. Cancel anytime.", price: "29.00", currency: "EUR", billing_interval_months: 1, item_count: 14 },
  { id: 2, name: "Quarterly", description: "Three months of everything, with a live check-in call.", price: "75.00", currency: "EUR", billing_interval_months: 3, item_count: 14 },
  { id: 3, name: "Yearly", description: "A full year of practice — two months free.", price: "290.00", currency: "EUR", billing_interval_months: 12, item_count: 14 },
];

const inDays = (d: number, hour: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

const event = (id: number, title: string, d: number, h: number, location: string, img: { url: string } | null, price = "0.00"): CalendarEvent =>
  ({
    id,
    type: "live",
    title,
    description: "",
    status: "scheduled",
    pricing_type: price === "0.00" ? "free" : "paid",
    price,
    scheduled_at: inDays(d, h),
    started_at: null,
    ended_at: null,
    location,
    thumbnail_signed_url: img?.url ?? null,
  }) as unknown as CalendarEvent;

export const FIXTURE_EVENTS: CalendarEvent[] = [
  event(1, "Slow Flow & Breath", 2, 8, "Online", P.teaching),
  event(2, "Sunday Restorative Workshop", 5, 10, "Studio, Lisbon", P.meditate2, "25.00"),
  event(3, "Arm Balance Lab", 8, 18, "Online", P.acro, "15.00"),
  event(4, "Full Moon Yin", 12, 20, "Studio, Lisbon", P.garden),
];

export function fixtureData(family: FamilyId, size: "long" | "short") {
  if (family === "courseShowcase") return size === "long" ? FIXTURE_COURSES : FIXTURE_COURSES.slice(0, 1);
  if (family === "pricing") return size === "long" ? FIXTURE_PLANS : FIXTURE_PLANS.slice(0, 1);
  if (family === "events") return size === "long" ? FIXTURE_EVENTS : FIXTURE_EVENTS.slice(0, 1);
  return undefined;
}
