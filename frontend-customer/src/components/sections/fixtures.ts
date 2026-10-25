/**
 * Showcase fixtures: content at the LONGEST and SHORTEST sizes each family
 * allows (the stress test and the minimum), and a REAL size that reads like a
 * composed site (the composer's home rules: a headline of at most 36 characters,
 * no hero meta or second button, kickers on the hero and two other sections, 3-4
 * benefits and moments, 3 steps, 3 courses) in three sets: yoga, business, family.
 * Plus sample courses / plans / events for dynamic families.
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

/** A clip for the video family: the file is missing on purpose (no video in the
 *  repo), so the player shows its poster, which is all a capture needs. */
const clip = (poster: { url: string }) => ({
  url: "/fixture-clip.mp4",
  video_id: null,
  poster: poster.url,
});

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
    image3: P.portrait2,
    image4: P.garden,
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
      {
        title: "Stronger, safer joints",
        text: "Progressive strength work protects shoulders, hips and lower back so flexibility comes without strain.",
      },
      {
        title: "Calm you can carry",
        text: "Short breath practices you can use in a meeting, on a train or at 2 a.m. when sleep won't come.",
      },
      {
        title: "Classes that meet you",
        text: "Every pose has an easier and a deeper option, so beginners and seasoned students share the same room.",
      },
      {
        title: "Learn at your pace",
        text: "Recorded courses stay yours; pause, repeat and come back whenever your schedule allows.",
      },
      {
        title: "Real feedback",
        text: "Ask questions under every lesson and get answers from me, not a support bot.",
      },
      {
        title: "Small live groups",
        text: "Live classes are capped at twelve so I can see you, cue you and learn your name.",
      },
    ],
    image: P.stretch,
  },
  courseShowcase: {
    kicker: "Courses",
    heading: "Start where you are, go as deep as you like",
    intro:
      "Self-paced programs you keep forever. Each one builds a real skill, with short daily sessions you'll actually finish.",
    ctaLabel: "See all courses",
    limit: "6",
  },
  howItWorks: {
    kicker: "How it works",
    heading: "From first class to a practice of your own",
    intro:
      "No pressure, no contracts. Pick the format that suits you and switch whenever your life changes.",
    steps: [
      {
        title: "Choose your path",
        text: "Start with a self-paced course or book a live class — both are designed for complete beginners.",
      },
      {
        title: "Practise a little, often",
        text: "Twenty focused minutes, four times a week, beats one exhausting class. Your plan shows you what to do next.",
      },
      {
        title: "Ask, adjust, repeat",
        text: "Leave a question on any lesson and get a personal answer, so you never practise a pose the wrong way.",
      },
      {
        title: "Make it yours",
        text: "After a few weeks you'll build your own short sequences for mornings, travel days and hard nights.",
      },
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
    caption:
      "Morning flows, Sunday workshops and the quiet minutes after savasana.",
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
    intro:
      "Join live classes, follow every course and get new sessions each month. Cancel any time from your account.",
  },
  faq: {
    kicker: "Questions",
    heading: "Everything you want to know before your first class",
    intro:
      "Can't find your answer? Write to me — I reply to every message within a day.",
    items: [
      {
        q: "I've never done yoga. Is this really for me?",
        a: "Yes. Every course starts with the basics and every pose has a simpler option. Most of my students started exactly where you are.",
      },
      {
        q: "What do I need at home?",
        a: "A mat and a quiet corner. A cushion and a strap help but a folded blanket and a belt work just as well.",
      },
      {
        q: "How long are the sessions?",
        a: "Course lessons run 15–30 minutes. Live classes are 60 minutes including a slow warm-up and a proper rest at the end.",
      },
      {
        q: "Can I practise with an injury?",
        a: "Often, yes — with care. Tell me about it before class and I'll suggest modifications, but always follow your doctor's advice first.",
      },
      {
        q: "Do the courses expire?",
        a: "No. Once you join a course it's yours, including future updates to its lessons.",
      },
      {
        q: "Can I switch between live and recorded?",
        a: "Any time. The membership covers both, so you can mix them week by week.",
      },
      {
        q: "How do I cancel?",
        a: "From your account page in two clicks. You keep access until the end of the period you paid for.",
      },
      {
        q: "Do you offer private sessions?",
        a: "A few each month. Send me a message with what you'd like to work on and I'll share available times.",
      },
    ],
  },
  cta: {
    kicker: "Your first week is on me",
    heading:
      "Roll out your mat — your stronger, calmer self is twenty minutes away",
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
    intro:
      "Small groups, real-time cues and a few minutes for questions at the end. Join from home or the studio.",
    ctaLabel: "See the full calendar",
  },
  proof: {
    heading: "What students say after a few weeks of practice with me",
    quotes: [
      {
        quote:
          "I came for my back and stayed for the quiet. Three months in, I sleep better, I sit better at my desk, and the twenty minutes before work have become the part of the day I protect most fiercely.",
        name: "Ana",
      },
      {
        quote:
          "Maya explains why a pose feels the way it does, so I finally practise on my own between classes instead of waiting for someone to tell me what to do.",
        name: "Joana",
      },
      {
        quote:
          "The online classes feel like the studio. She sees you through the camera and fixes the small things that used to hurt.",
        name: "Margarida",
      },
    ],
    numbers: [
      { value: "1,200+", label: "students taught since the first class" },
      { value: "14", label: "years teaching vinyasa and breathwork" },
      { value: "40", label: "live classes every month, online and in Lisbon" },
    ],
    press: [
      { name: "The Lisbon Wellness Review" },
      { name: "Yoga Journal Portugal" },
      { name: "Observador" },
    ],
  },
  statement: {
    statement: "Rest is part of the practice, not a break from it, every day",
    attribution: "Maya Laurent",
  },
  video: {
    heading: "Ten seconds from a Tuesday morning class in the Lisbon studio",
    caption:
      "Slow sun salutations with the window open. Every class starts like this, online or in the room.",
    video: clip(P.teaching),
    shape: "vertical",
  },
};

const SHORT: Record<FamilyId, Content> = {
  hero: {
    headline: "Yoga for real life",
    image: P.teaching2,
    image2: P.detail,
    image3: P.portrait2,
    image4: P.garden,
    ctaLabel: "Start",
    ctaHref: "/courses",
  },
  story: {
    heading: "Hi, I'm Maya",
    body: "<p>I teach slow, strong yoga.</p>",
    image: P.portrait,
  },
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
  moments: {
    photos: [{ image: P.acro }, { image: P.detail }, { image: P.stretch }],
  },
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
  proof: { quotes: [{ quote: "I sleep better." }] },
  statement: { statement: "Unapologetically" },
  video: { video: clip(P.stretch), shape: "vertical" },
};

// --- REAL: three composed sets --------------------------------------------------
// S1: a person in frame, matched to the set's audience (detail crops count). One
// recognisable coach portrait per page: the hero's `coach`; every other person slot
// shows students or a detail crop.

export type FixtureSet = "yoga" | "business" | "family";
export const FIXTURE_SETS: FixtureSet[] = ["yoga", "business", "family"];

const PHOTO_KEYS = [
  "coach",
  "hero2",
  "hero3",
  "hero4",
  "story",
  "story2",
  "benefits",
  "how",
  "philosophy",
  "m1",
  "m2",
  "m3",
  "m4",
  "cta",
  "contact",
  "c1",
  "c2",
  "c3",
  "e1",
  "e2",
  "e3",
] as const;
type PhotoKey = (typeof PHOTO_KEYS)[number];
type Ph = Record<PhotoKey, ReturnType<typeof px>>;
const photos = (ids: Record<PhotoKey, string>): Ph =>
  Object.fromEntries(PHOTO_KEYS.map((k) => [k, px(ids[k])])) as Ph;

// yoga: women 30-50, coach in her thirties
const YOGA = photos({
  coach: "76096030-8fb4-4209-8a78-5468233ed15a", // seated, arms wide, smiling (square)
  hero2: "40609d56-227e-4564-af21-d7c991d51953", // hands on a green mat, from above
  hero3: "6dcaee5b-56c3-4a34-8b46-17ae4e472775", // student stretching, plain wall
  hero4: "5f70b176-4365-4c58-aec5-e4535b52aa16", // bare feet on a navy mat
  story: "aa94121b-607a-41f0-9486-63e2e287e668", // women resting in savasana, studio
  story2: "00ba6f64-788c-44eb-8b61-be3ed91cd868", // hands pressing a mat, down dog
  benefits: "f55ab5f3-8a20-46e9-af24-a9eb05ad2fff", // student resting in child's pose
  how: "d1ead5a5-7c9f-4f9c-857c-fa297cdf3cd1", // student with tea on a cushion
  philosophy: "dde1db4c-40ff-426a-bae4-6f0f4179c195", // back view, hands clasped
  m1: "558cbe69-5c0d-46bc-a8ff-e05cc70a2a9a", // class in downward dog
  m2: "d1f7d01d-d24f-4570-902f-9aaa18d41fc1", // class, arms overhead
  m3: "7f70517c-587d-4f34-a268-55c5419a8f95", // four students on mats
  m4: "21f591af-78b2-44ac-972a-c3e05ae7c906", // feet and a strap
  cta: "99338c05-d809-4320-9a8d-8aad42fac69d", // student meditating, plants
  contact: "f4e10c45-bbc8-4fe6-b64f-f6ae0cd70355", // online class, laptop and lantern
  c1: "27fed812-3436-41a5-86ae-01cf60a3e70a", // seated side stretch
  c2: "c19c7795-396c-48b9-907a-b0712186ddb3", // bridge on a block
  c3: "b80ef895-b3ad-4650-b419-48e15ef72bf8", // child's pose, wide room
  e1: "684b71f3-e814-46a7-910a-9d632f80c9a7", // evening breath at home
  e2: "c47b8bc6-82d4-446d-b86a-318f4cb54198", // seated class
  e3: "37e0ca97-971d-4ff2-9a73-6d6fc8ff1fb7", // wide-legged fold
});

// business: working professionals, coach in her forties
const BIZ = photos({
  coach: "529c94ed-63fa-43d0-935c-a14a054d39f5", // navy blazer, close portrait
  hero2: "a13ee45a-6c35-4257-a8b4-97c3223f619e", // hands writing in a notebook
  hero3: "04315aa5-e3f1-4836-bb2f-212e4d270fc0", // workshop, sticky notes
  hero4: "508cae96-9deb-45ba-ab38-9c4b542d72d0", // laptop and notebook, from above
  story: "ffb15e4b-9ad4-44fe-a699-7fe8bdeb7b3e", // two colleagues at a laptop
  story2: "869bdb78-3de8-42f8-84cc-0b92d9aab4fe", // notebook and mug, warm light
  benefits: "8ff9d508-7fe7-4e6c-bf41-c57c5dac54a3", // working at a laptop, shelves
  how: "6f4b3ec9-fda8-4c45-b0e6-5f6ea77cde9b", // two women talking in a lounge
  philosophy: "39c811c0-ead5-4cb0-8a0f-cc2a04bbbdf3", // notebook on a bed
  m1: "f332ae90-0772-44a0-b49e-fd41919a7618", // three peers at a table
  m2: "ceab9c7c-f90b-404f-8c54-8b6372a035f9", // five around a table
  m3: "52ea650c-7cb2-417d-9114-bc01cd86b59b", // two peers with laptops
  m4: "b2389dfe-5bb1-4df0-8a15-70a92f5ab5c9", // pairs in an open office
  cta: "43285c3c-edcb-404c-82df-87acedbe1d48", // handshake
  contact: "c94bc48c-345c-46a3-8021-e963acbcf2df", // writing at a table
  c1: "7b72e8cf-1880-4c1c-9084-6395e96741a0", // hands editing a printed plan, red pen
  c2: "76618df5-abc1-4f80-a6ea-3fcdf6594435", // conversation across a table
  c3: "4815e4ea-821d-4d47-8ed7-c0c2a8f93800", // laptop by a window
  e1: "01ec3f00-9768-461b-8531-158b89c1fdf3", // laptop in a cafe
  e2: "46bbdbb7-f5a8-4d9d-b6d7-04a7a6bc403f", // two people across a desk
  e3: "050397a1-3998-4318-8676-0520793789f7", // conversation in an office
});

// family: parents of young children, coach in her forties
const FAM = photos({
  coach: "ff3b4827-b2d1-4201-add4-320e2d809f0b", // warm close portrait
  hero2: "d4a7cacd-e6e4-4305-b9d2-e127d9036253", // newborn and a father's hand
  hero3: "ecaff711-7292-4ce4-8cc8-5a9fd1563fae", // child at a clay table
  hero4: "b2f63fcb-c9da-4b2c-98e9-882ae481f24b", // hands shaping cookies
  story: "dfbdfd11-3f22-4336-9863-c449fa251b3e", // mother and toddler laughing, studio floor
  story2: "a633fd13-8aef-4830-b284-67b9ae1fcc62", // child with a rainbow stacker
  benefits: "205ecbc9-f98f-4c6e-9829-f39904165b2b", // mother lifting a toddler
  how: "0122fe31-d649-4064-9961-d97852a6bf41", // family cooking
  philosophy: "1f06168a-8750-4123-86da-f19bd83db130", // bedtime story
  m1: "d08afac5-bc45-439a-86d4-bf8fa5ad8ac5", // children building with cardboard
  m2: "c787b35d-721d-4253-a418-1eca5d48bb4a", // parents and baby, music
  m3: "2a2313d2-51a6-41b2-aca6-3c1b704b0514", // family board game
  m4: "5430100f-7d64-4b07-83cc-dfcd35e70f95", // autumn park
  cta: "cda1e51e-892f-4806-8aa4-25165c8b9cbf", // mother and baby on a mat
  contact: "7a0dc44d-2356-4211-8ba4-c4807f72fa6e", // playroom
  c1: "3e156ed2-13b2-4c0c-a0fd-9eaf44b390ef", // reading with children
  c2: "c7474216-0d62-4c82-89d7-e7e7787eac20", // child at play
  c3: "d24d5c61-4b47-4111-976d-2ef59e557e13", // parents and child with blocks
  e1: "ad872881-56ae-44a0-b29c-769332be21f8", // family walking in
  e2: "3a51eec7-404e-4a5c-9fcb-817071e67a7b", // kitchen
  e3: "cc4b5c30-e3e7-442c-8409-738b998c09f0", // floor play
});

const realYoga = (p: Ph): Record<FamilyId, Content> => ({
  hero: {
    kicker: "Vinyasa & breathwork · Lisbon",
    headline: "Strength that feels like ease",
    subhead:
      "Slow, intelligent flow classes for busy people, online from anywhere or in my light-filled studio.",
    ctaLabel: "Start the 7-day course",
    ctaHref: "/courses",
    secondaryLabel: "",
    secondaryHref: "",
    meta: "",
    image: p.coach,
    image2: p.hero2,
    image3: p.hero3,
    image4: p.hero4,
  },
  story: {
    kicker: "Hello, I'm Maya",
    heading: "I teach yoga for people who think they're not flexible enough",
    body: "<p>I came to the mat at thirty-one with a sore back, a desk job and zero patience. What kept me there wasn't the poses, it was the hour where nothing else asked anything of me.</p><p>Today I teach the classes I wish I'd found then: unhurried, precise and kind. Join a live class or follow a course from your living room and you'll get clear cues, honest modifications and a teacher who answers your questions.</p>",
    signature: "Maya",
    ctaLabel: "Read my story",
    ctaHref: "/about",
    image: p.story,
    image2: p.story2,
  },
  benefits: {
    heading: "A practice that fits the life you have",
    intro:
      "Every class is built around what changes in your body and your week, not around how many poses fit into an hour.",
    items: [
      {
        title: "Stronger, safer joints",
        text: "Progressive strength work protects shoulders, hips and lower back, so flexibility comes without strain.",
      },
      {
        title: "Calm you can carry",
        text: "Short breath practices for a meeting, a train or 2 a.m. when sleep won't come.",
      },
      {
        title: "Classes that meet you",
        text: "Every pose has an easier and a deeper option, so beginners and old hands share the room.",
      },
      {
        title: "Small live groups",
        text: "Live classes are capped at twelve, so I can see you, cue you and learn your name.",
      },
    ],
    image: p.benefits,
  },
  courseShowcase: {
    heading: "Start where you are",
    intro:
      "Self-paced programs you keep forever, with short daily sessions you'll actually finish.",
    ctaLabel: "See all courses",
    limit: "3",
  },
  howItWorks: {
    heading: "From first class to a practice of your own",
    intro: "No pressure, no contracts. Switch formats whenever your life does.",
    steps: [
      {
        title: "Choose your path",
        text: "Start with a self-paced course or book a live class. Both are made for complete beginners.",
      },
      {
        title: "Practise a little, often",
        text: "Twenty focused minutes, four times a week, beats one exhausting class.",
      },
      {
        title: "Ask, adjust, repeat",
        text: "Leave a question under any lesson and get a personal answer from me.",
      },
    ],
    image: p.how,
  },
  philosophy: {
    statement:
      "Flexibility is a side effect. The real practice is staying with yourself, curious and kind, when things get hard.",
    attribution: "Maya Laurent",
    image: p.philosophy,
  },
  moments: {
    heading: "Moments from class",
    caption:
      "Morning flows, Sunday workshops and the quiet minutes after savasana.",
    photos: [
      { image: p.m1, caption: "Sunday slow flow" },
      { image: p.m2, caption: "Morning flow, Tuesday" },
      { image: p.m3, caption: "Beginners' series" },
      { image: p.m4, caption: "Props and straps lab" },
    ],
  },
  pricing: {
    heading: "One membership, every class and course",
    intro:
      "Join live classes, follow every course and get new sessions each month. Cancel any time from your account.",
  },
  faq: {
    heading: "Before your first class",
    intro: "Can't find your answer? Write to me, I reply within a day.",
    items: [
      {
        q: "I've never done yoga. Is this really for me?",
        a: "Yes. Every course starts with the basics and every pose has a simpler option. Most of my students started exactly where you are.",
      },
      {
        q: "What do I need at home?",
        a: "A mat and a quiet corner. A folded blanket and a belt work as well as a cushion and a strap.",
      },
      {
        q: "How long are the sessions?",
        a: "Course lessons run 15 to 30 minutes. Live classes are 60 minutes, with a slow warm-up and a proper rest at the end.",
      },
      {
        q: "Can I practise with an injury?",
        a: "Often, yes, with care. Tell me about it before class and I'll suggest modifications, but follow your doctor's advice first.",
      },
      {
        q: "How do I cancel?",
        a: "From your account page in two clicks. You keep access until the end of the period you paid for.",
      },
    ],
  },
  cta: {
    heading: "Roll out your mat",
    text: "Start the free 7-day beginner course today. No card, no pressure, one short session a day.",
    ctaLabel: "Start free today",
    ctaHref: "/courses",
    image: p.cta,
  },
  contact: {
    heading: "Questions about a class or a course?",
    text: "Send me a message and I'll reply personally within a day. For studio classes I'm in Príncipe Real, five minutes from the metro.",
    email: "hello@mayalaurent.studio",
    location: "Rua da Escola Politécnica 42, Lisbon",
    hours: "Replies within 24 hours, Mon to Sat",
    showForm: true,
    image: p.contact,
  },
  events: {
    kicker: "Live",
    heading: "Upcoming live classes",
    intro:
      "Small groups, real-time cues and a few minutes for questions at the end.",
    ctaLabel: "See the full calendar",
  },
  proof: {
    heading: "In their words",
    quotes: [
      {
        quote:
          "I came for my back and stayed for the quiet. The twenty minutes before work are mine now.",
        name: "Ana",
      },
      {
        quote:
          "She explains why a pose feels the way it does, so I practise on my own between classes.",
        name: "Joana",
      },
    ],
    numbers: [
      { value: "1,200", label: "students taught" },
      { value: "14", label: "years teaching" },
    ],
  },
  statement: {
    statement: "Rest is part of the practice.",
    attribution: "Maya",
  },
  video: { video: clip(p.m1), shape: "vertical" },
});

const realBusiness = (p: Ph): Record<FamilyId, Content> => ({
  hero: {
    kicker: "Leadership coaching · London",
    headline: "Lead with clarity, not noise",
    subhead:
      "Practical coaching for new managers who want better decisions, calmer teams and a career that fits.",
    ctaLabel: "Start the first module",
    ctaHref: "/courses",
    secondaryLabel: "",
    secondaryHref: "",
    meta: "",
    image: p.coach,
    image2: p.hero2,
    image3: p.hero3,
    image4: p.hero4,
  },
  story: {
    kicker: "Hello, I'm Elena",
    heading: "I coach managers who were promoted, not prepared",
    body: "<p>Nobody trained me to run a team. I was good at the work, so I got the job, and then spent a year guessing.</p><p>Now I help new managers skip the guessing. We work on the conversations that matter, like setting expectations, giving feedback and saying no, in plain language and with real situations from your week.</p>",
    signature: "Elena",
    ctaLabel: "Read my story",
    ctaHref: "/about",
    image: p.story,
    image2: p.story2,
  },
  benefits: {
    heading: "What changes when you lead on purpose",
    intro:
      "Each program is built around the situations you face this month, not around theory you'll never use.",
    items: [
      {
        title: "Clearer decisions",
        text: "A simple way to weigh options, decide and explain why, without waiting for certainty.",
      },
      {
        title: "Better conversations",
        text: "Scripts and role-plays for feedback, expectations and the talks you have been putting off.",
      },
      {
        title: "A calmer week",
        text: "Weekly routines that protect your focus and keep your team from waiting on you.",
      },
    ],
    image: p.benefits,
  },
  courseShowcase: {
    heading: "Programs you can start tonight",
    intro:
      "Self-paced and yours to keep, with short sessions you can fit between meetings.",
    ctaLabel: "See all programs",
    limit: "3",
  },
  howItWorks: {
    heading: "From first week to your own way of leading",
    intro:
      "No long contracts. Pick a program or book a session when you need one.",
    steps: [
      {
        title: "Tell me where you are",
        text: "A short questionnaire shows what is working, what is stuck and where to start.",
      },
      {
        title: "Work on one real situation",
        text: "Every lesson ends with something to try in your next one-to-one or team meeting.",
      },
      {
        title: "Review and adjust",
        text: "Bring what happened to office hours and we refine your approach together.",
      },
    ],
    image: p.how,
  },
  philosophy: {
    statement:
      "Good leadership is mostly good conversations. Have the hard ones early, and have them kindly.",
    attribution: "Elena Marsh",
    image: p.philosophy,
  },
  moments: {
    heading: "Inside the workshops",
    caption: "Leadership labs, peer circles and the coffee afterwards.",
    photos: [
      { image: p.m1, caption: "Peer circle" },
      { image: p.m2, caption: "Leadership lab, Tuesday" },
      { image: p.m3, caption: "Pair practice" },
      { image: p.m4, caption: "Feedback practice" },
    ],
  },
  pricing: {
    heading: "One membership, every program",
    intro:
      "Follow every program, join the live labs and get new material each month. Cancel any time from your account.",
  },
  faq: {
    heading: "Before you start",
    intro: "Not sure which program fits? Write to me, I reply within a day.",
    items: [
      {
        q: "I'm a first-time manager. Where do I begin?",
        a: "With the First 90 Days program. It walks you through your first quarter week by week, with templates for each conversation.",
      },
      {
        q: "How much time does it take?",
        a: "Lessons run 10 to 20 minutes. Most people finish a program in a few weeks, alongside a full workload.",
      },
      {
        q: "Is this useful if I lead a remote team?",
        a: "Yes. Every script and routine has a remote version, and the live labs are online as well as in person.",
      },
      {
        q: "Can my company pay for it?",
        a: "Many managers do. I'll send an invoice and a short summary you can share with your manager or HR.",
      },
      {
        q: "How do I cancel?",
        a: "From your account page in two clicks. You keep access until the end of the period you paid for.",
      },
    ],
  },
  cta: {
    heading: "Your next hard conversation, rehearsed",
    text: "Start the first module free and try one script in your next one-to-one. No card needed.",
    ctaLabel: "Start the first module",
    ctaHref: "/courses",
    image: p.cta,
  },
  contact: {
    heading: "Want to talk it through first?",
    text: "Tell me about your team and what feels hard right now. I'll reply personally within a day and suggest where to start.",
    email: "hello@elenamarsh.co",
    location: "Clerkenwell, London",
    hours: "Replies within 24 hours, Mon to Fri",
    showForm: true,
    image: p.contact,
  },
  events: {
    kicker: "Live",
    heading: "Upcoming sessions",
    intro: "Small groups, real situations and time for your questions.",
    ctaLabel: "See the full calendar",
  },
  proof: {
    heading: "What clients say",
    quotes: [
      {
        quote:
          "Elena helped me have the conversation I had avoided for a year. It took ten minutes and changed the team.",
        name: "Priya",
      },
      {
        quote:
          "Practical, kind and very direct. I left every session with one thing to try on Monday.",
        name: "Tom",
      },
    ],
    press: [{ name: "Harvard Business Review" }, { name: "The Guardian" }],
  },
  statement: { statement: "Have the hard talks early.", attribution: "Elena" },
  video: {
    heading: "A minute from a workshop",
    video: clip(p.m1),
    shape: "wide",
  },
});

const realFamily = (p: Ph): Record<FamilyId, Content> => ({
  hero: {
    kicker: "Calm parenting · Portland",
    headline: "Calmer evenings, closer family",
    subhead:
      "Gentle, practical coaching for parents of young children who want fewer battles and more good days.",
    ctaLabel: "Start the 5-day reset",
    ctaHref: "/courses",
    secondaryLabel: "",
    secondaryHref: "",
    meta: "",
    image: p.coach,
    image2: p.hero2,
    image3: p.hero3,
    image4: p.hero4,
  },
  story: {
    kicker: "Hello, I'm Hannah",
    heading: "I help parents who are tired of shouting",
    body: "<p>When my son was three, our evenings were a battle and I hated who I was becoming. I learned the hard way that calm is a skill, and that skills can be taught.</p><p>Now I teach it to other parents: simple routines, words that work with small children and kind ways to repair after a bad day. No perfect parents here, just a bit less shouting each week.</p>",
    signature: "Hannah",
    ctaLabel: "Read my story",
    ctaHref: "/about",
    image: p.story,
    image2: p.story2,
  },
  benefits: {
    heading: "Small changes that add up",
    intro:
      "Everything here is short enough to try tonight and gentle enough to keep doing when you're tired.",
    items: [
      {
        title: "Smoother bedtimes",
        text: "A simple routine and the exact words to use when your child says no for the tenth time.",
      },
      {
        title: "Fewer meltdowns",
        text: "Help your child name big feelings, and stay steady while they learn to handle them.",
      },
      {
        title: "Repair after rough days",
        text: "Say sorry, reconnect and start fresh, without guilt and without lecturing.",
      },
      {
        title: "Support, not judgement",
        text: "Ask questions under every lesson and get an answer from me, not a chatbot.",
      },
    ],
    image: p.benefits,
  },
  courseShowcase: {
    heading: "Pick one thing to work on",
    intro:
      "Short audio and video lessons you can follow at nap time or after bedtime. Yours to keep.",
    ctaLabel: "See all courses",
    limit: "3",
  },
  howItWorks: {
    heading: "From chaos to a rhythm that works",
    intro: "Start small. One change a week is plenty.",
    steps: [
      {
        title: "Choose your hardest hour",
        text: "Mornings, meals or bedtime. We start where it hurts most.",
      },
      {
        title: "Try one small change",
        text: "Each lesson gives you one script and one routine to try with your child.",
      },
      {
        title: "Tell me how it went",
        text: "Share what happened and get a personal answer, so you can adjust and keep going.",
      },
    ],
    image: p.how,
  },
  philosophy: {
    statement:
      "You don't need to be a calm parent all the time. You need to be a parent who comes back, every time.",
    attribution: "Hannah Brooks",
    image: p.philosophy,
  },
  moments: {
    heading: "Family workshops",
    caption: "Play mornings, parent circles and the cake afterwards.",
    photos: [
      { image: p.m1, caption: "Saturday build morning" },
      { image: p.m2, caption: "Baby music circle" },
      { image: p.m3, caption: "Game night for families" },
      { image: p.m4, caption: "Autumn walk" },
    ],
  },
  pricing: {
    heading: "One membership, every course",
    intro:
      "Follow every course, join the live Q&As and get new lessons each month. Cancel any time from your account.",
  },
  faq: {
    heading: "Questions parents ask",
    intro: "Can't find your answer? Write to me, I reply within a day.",
    items: [
      {
        q: "My child is two. Is it too early?",
        a: "No. The routines and words work from about eighteen months. Each lesson says what to adjust for your child's age.",
      },
      {
        q: "How long are the lessons?",
        a: "Five to fifteen minutes, so you can watch one at nap time or after bedtime.",
      },
      {
        q: "Do we both need to take part?",
        a: "It helps, but it isn't required. One calm parent making small changes makes a real difference.",
      },
      {
        q: "Is this therapy?",
        a: "No. It's practical coaching for everyday family life. If you're worried about your child's health, please talk to a professional.",
      },
      {
        q: "How do I cancel?",
        a: "From your account page in two clicks. You keep access until the end of the period you paid for.",
      },
    ],
  },
  cta: {
    heading: "One calmer evening is a good start",
    text: "Begin the free 5-day reset tonight. Five short lessons, no card needed.",
    ctaLabel: "Start the free reset",
    ctaHref: "/courses",
    image: p.cta,
  },
  contact: {
    heading: "Not sure where to start?",
    text: "Tell me about your family and your hardest hour. I'll reply personally within a day and point you to the right course.",
    email: "hello@hannahbrooks.family",
    location: "Alberta Arts District, Portland",
    hours: "Replies within 24 hours, Mon to Fri",
    showForm: true,
    image: p.contact,
  },
  events: {
    kicker: "Live",
    heading: "Upcoming parent sessions",
    intro:
      "Small groups, real questions and no judgement. Join from the sofa or in person.",
    ctaLabel: "See the full calendar",
  },
  proof: {
    heading: "From parents who came",
    quotes: [
      {
        quote:
          "Bedtime used to take two hours. Now it takes twenty minutes and a story.",
        name: "Lena",
      },
    ],
    numbers: [{ value: "600", label: "families in the evening circles" }],
  },
  statement: { statement: "Come back, every time.", attribution: "Hannah" },
  video: { video: clip(p.m1), shape: "vertical" },
});

const REAL: Record<FixtureSet, Record<FamilyId, Content>> = {
  yoga: realYoga(YOGA),
  business: realBusiness(BIZ),
  family: realFamily(FAM),
};

type FixtureSize = "long" | "short" | "real";

export function fixtureBlock(
  family: FamilyId,
  variant: string,
  size: FixtureSize,
  set: FixtureSet = "yoga",
): Block {
  const content = (
    size === "real" ? REAL[set] : size === "long" ? LONG : SHORT
  )[family];
  return {
    id: `fx_${family}_${variant.replace(/\W/g, "_")}_${size === "real" ? `real_${set}` : size}`,
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
  by = "Maya Laurent",
): Course => ({
  id,
  title,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  description,
  instructor: 1,
  instructor_name: by,
  thumbnail_url: img.url,
  thumbnail_signed_url: img.url,
  price,
  pricing_type: pricing,
  is_published: true,
  order: id,
  lesson_count: lessons,
});

export const FIXTURE_COURSES: Course[] = [
  course(
    1,
    "Yoga Foundations: Your First 30 Days",
    "Build a safe, strong base with four short sessions a week — alignment, breath and the poses everything else is built on.",
    "49.00",
    P.teaching2,
    24,
  ),
  course(
    2,
    "Strong Spine, Calm Mind",
    "A posture and core program for desk workers: release the neck and lower back, then build the strength that keeps them happy.",
    "39.00",
    P.stretch,
    18,
  ),
  course(
    3,
    "7-Day Beginner Reset",
    "Seven gentle sessions to start moving again. Free, short and kind.",
    "0.00",
    P.meditate,
    7,
    "free",
  ),
  course(
    4,
    "Breathwork for Better Sleep",
    "Evening breath and restorative practices that switch your nervous system off.",
    "29.00",
    P.meditate2,
    10,
  ),
  course(
    5,
    "Arm Balances Without Fear",
    "Crow, side crow and beyond — progressive drills that make balancing feel inevitable.",
    "59.00",
    P.acro,
    21,
  ),
  course(
    6,
    "Hips & Hamstrings Lab",
    "Twelve focused sessions that open tight hips and hamstrings without forcing.",
    "35.00",
    P.detail2,
    12,
  ),
];

export const FIXTURE_PLANS: SubscriptionPlan[] = [
  {
    id: 1,
    name: "Monthly",
    description: "Every live class and every course. Cancel anytime.",
    price: "29.00",
    currency: "EUR",
    billing_interval_months: 1,
    item_count: 14,
  },
  {
    id: 2,
    name: "Quarterly",
    description: "Three months of everything, with a live check-in call.",
    price: "75.00",
    currency: "EUR",
    billing_interval_months: 3,
    item_count: 14,
  },
  {
    id: 3,
    name: "Yearly",
    description: "A full year of practice — two months free.",
    price: "290.00",
    currency: "EUR",
    billing_interval_months: 12,
    item_count: 14,
  },
];

const inDays = (d: number, hour: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

const event = (
  id: number,
  title: string,
  d: number,
  h: number,
  location: string,
  img: { url: string } | null,
  price = "0.00",
): CalendarEvent =>
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
  event(
    2,
    "Sunday Restorative Workshop",
    5,
    10,
    "Studio, Lisbon",
    P.meditate2,
    "25.00",
  ),
  event(3, "Arm Balance Lab", 8, 18, "Online", P.acro, "15.00"),
  event(4, "Full Moon Yin", 12, 20, "Studio, Lisbon", P.garden),
];

const thumbs = <T extends object>(
  list: T[],
  keys: string[],
  imgs: { url: string }[],
) =>
  list.map((x, i) => ({
    ...x,
    ...Object.fromEntries(keys.map((k) => [k, imgs[i].url])),
  }));

const plan = (
  id: number,
  name: string,
  description: string,
  price: string,
  currency: string,
  months: number,
  items: number,
): SubscriptionPlan => ({
  id,
  name,
  description,
  price,
  currency,
  billing_interval_months: months,
  item_count: items,
});

// Three of each per set; the yoga set keeps the sample copy and swaps in the real photos.
const REAL_DATA: Record<
  FixtureSet,
  { courses: Course[]; plans: SubscriptionPlan[]; events: CalendarEvent[] }
> = {
  yoga: {
    courses: thumbs(
      FIXTURE_COURSES.slice(0, 3),
      ["thumbnail_url", "thumbnail_signed_url"],
      [YOGA.c1, YOGA.c2, YOGA.c3],
    ),
    plans: FIXTURE_PLANS,
    events: thumbs(
      FIXTURE_EVENTS.slice(0, 3),
      ["thumbnail_signed_url"],
      [YOGA.e1, YOGA.e2, YOGA.e3],
    ),
  },
  business: {
    courses: [
      course(
        1,
        "Your First 90 Days as a Manager",
        "Plan, listen and set expectations in your first quarter, with a template for every week.",
        "149.00",
        BIZ.c1,
        12,
        "paid",
        "Elena Marsh",
      ),
      course(
        2,
        "Feedback That Lands",
        "Give and receive feedback without the dread: scripts, role-plays and a checklist for hard conversations.",
        "89.00",
        BIZ.c2,
        8,
        "paid",
        "Elena Marsh",
      ),
      course(
        3,
        "The Manager's Weekly Reset",
        "Four short sessions for a calmer, more intentional week.",
        "0.00",
        BIZ.c3,
        4,
        "free",
        "Elena Marsh",
      ),
    ],
    plans: [
      plan(
        1,
        "Monthly",
        "Every program and every live lab. Cancel anytime.",
        "59.00",
        "GBP",
        1,
        9,
      ),
      plan(
        2,
        "Quarterly",
        "Three months of everything, with a one-to-one check-in.",
        "159.00",
        "GBP",
        3,
        9,
      ),
      plan(
        3,
        "Yearly",
        "A full year of leading on purpose, two months free.",
        "590.00",
        "GBP",
        12,
        9,
      ),
    ],
    events: [
      event(1, "Open Office Hours", 2, 12, "Online", BIZ.e1),
      event(
        2,
        "Leadership Lab: Hard Conversations",
        6,
        18,
        "Clerkenwell, London",
        BIZ.e2,
        "35.00",
      ),
      event(3, "Career Story Workshop", 11, 17, "Online", BIZ.e3, "20.00"),
    ],
  },
  family: {
    courses: [
      course(
        1,
        "The 5-Day Calm Reset",
        "Five short lessons to cut the shouting and bring calm back to your evenings.",
        "0.00",
        FAM.c1,
        5,
        "free",
        "Hannah Brooks",
      ),
      course(
        2,
        "Bedtime Without Battles",
        "A step-by-step routine for toddlers and preschoolers, with scripts for the hard nights.",
        "59.00",
        FAM.c2,
        9,
        "paid",
        "Hannah Brooks",
      ),
      course(
        3,
        "Big Feelings, Small Humans",
        "Help your child name feelings and handle tantrums, without losing yourself.",
        "79.00",
        FAM.c3,
        14,
        "paid",
        "Hannah Brooks",
      ),
    ],
    plans: [
      plan(
        1,
        "Monthly",
        "Every course and every live Q&A. Cancel anytime.",
        "24.00",
        "USD",
        1,
        8,
      ),
      plan(
        2,
        "Quarterly",
        "Three months of everything, with a one-to-one call.",
        "62.00",
        "USD",
        3,
        8,
      ),
      plan(
        3,
        "Yearly",
        "A full year of support, two months free.",
        "230.00",
        "USD",
        12,
        8,
      ),
    ],
    events: [
      event(1, "Parent Q&A: Tantrums", 3, 20, "Online", FAM.e1),
      event(
        2,
        "Saturday Family Play Morning",
        7,
        10,
        "Community hall, Portland",
        FAM.e2,
        "15.00",
      ),
      event(3, "Evening Reset for Parents", 12, 20, "Online", FAM.e3, "10.00"),
    ],
  },
};

export function fixtureData(
  family: FamilyId,
  size: FixtureSize,
  set: FixtureSet = "yoga",
) {
  if (size === "real") {
    const d = REAL_DATA[set];
    if (family === "courseShowcase") return d.courses;
    if (family === "pricing") return d.plans;
    if (family === "events") return d.events;
    return undefined;
  }
  if (family === "courseShowcase")
    return size === "long" ? FIXTURE_COURSES : FIXTURE_COURSES.slice(0, 1);
  if (family === "pricing")
    return size === "long" ? FIXTURE_PLANS : FIXTURE_PLANS.slice(0, 1);
  if (family === "events")
    return size === "long" ? FIXTURE_EVENTS : FIXTURE_EVENTS.slice(0, 1);
  return undefined;
}
