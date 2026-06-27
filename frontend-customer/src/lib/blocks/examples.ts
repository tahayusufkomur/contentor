// Niche-aware example content for newly-added blocks. When a coach adds a block
// in the builder, `newBlock(type, niche)` merges the matching example overrides
// (below) onto the block's `defaultData`, so the block lands pre-filled with
// illustrative, on-topic content instead of an empty shell. Every block type has
// auto content; media/dynamic blocks fill heading/intro text only (their images
// and live items come from the coach's own assets).
//
// Copy for hero / imageText / testimonials / faq / cta is transcribed from the
// niche seed modules (backend `apps/core/management/commands/demo_data/<niche>.py`
// `landing_sections`); richText / stats / banner are curated per niche. Stats
// numbers are intentionally illustrative placeholders for the coach to edit.
//
// Keys match each block's registry data fields exactly:
//   hero         { heading, subheading, ctaText, ctaHref }
//   richText     { heading, body }          (body = rich-text HTML)
//   imageText    { heading, body }
//   testimonials { heading, items: [{ name, text }] }
//   faq          { heading, items: [{ q, a }] }
//   cta          { heading, buttonText, buttonHref }
//   stats        { heading, items: [{ value, label }] }
//   banner       { text, linkText, linkHref }
//   contact      { heading, intro }
//   pricingPlans { heading, subheading }
//   gallery / logos / video / courseGrid / upcomingEvents / storeProducts { heading }

export type NicheKey =
  | "yoga"
  | "pilates"
  | "fitness"
  | "face_yoga"
  | "belly_dance"
  | "pole_dance"
  | "makeup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockExample = Record<string, any>;

/** Niche-neutral examples — used when the tenant's niche is unknown or a niche
 *  doesn't override a given block type. */
export const GENERIC_EXAMPLES: Record<string, BlockExample> = {
  hero: {
    heading: "Learn from the best",
    subheading:
      "Practical, step-by-step lessons to help you grow at your own pace.",
    ctaText: "Browse programs",
    ctaHref: "/courses",
  },
  richText: {
    heading: "Why learn with me?",
    body: "<p>I've spent years refining a simple, proven approach so you can make real progress without the guesswork. Each lesson builds on the last — clear, practical, and made for every level.</p>",
  },
  imageText: {
    heading: "About me",
    body: "<p>Hi, I'm your instructor. I created these courses to share what's worked for hundreds of students — and to help you get there faster, with guidance every step of the way.</p>",
  },
  testimonials: {
    heading: "What students say",
    items: [
      {
        name: "Alex R.",
        text: "Clear, well-paced, and genuinely useful. I finally feel like I'm making progress every week.",
      },
      {
        name: "Jordan M.",
        text: "The lessons are easy to follow and the results speak for themselves. Highly recommend.",
      },
      {
        name: "Sam T.",
        text: "Felt like a private session. The detail and care in every lesson make all the difference.",
      },
    ],
  },
  faq: {
    heading: "Frequently asked questions",
    items: [
      {
        q: "Is this suitable for beginners?",
        a: "Absolutely. Each program starts with the fundamentals and includes modifications, so you can begin at any level and progress at your own pace.",
      },
      {
        q: "Do I need any special equipment?",
        a: "No — you can get started with what you already have. Any optional extras are noted in the individual lessons.",
      },
      {
        q: "Can I access the courses on mobile?",
        a: "Yes! The platform is fully responsive. Stream lessons on your phone, tablet, or computer — perfect for learning anywhere.",
      },
    ],
  },
  cta: {
    heading: "Ready to get started?",
    buttonText: "Join now",
    buttonHref: "/courses",
  },
  stats: {
    heading: "Trusted by learners",
    items: [
      { value: "500+", label: "Students" },
      { value: "30+", label: "Hours of video" },
      { value: "4.9★", label: "Average rating" },
    ],
  },
  banner: {
    text: "New courses just added — start learning today.",
    linkText: "Browse programs",
    linkHref: "/courses",
  },
  // Media + dynamic blocks: auto content fills the heading/intro text only — the
  // images, videos and live items (courses/plans/events/products) come from the
  // coach's own assets, so they're left for the coach to add.
  contact: {
    heading: "Get in touch",
    intro:
      "Have a question or want to work together? Send a message and I'll get back to you soon.",
  },
  gallery: {
    heading: "A look inside",
  },
  logos: {
    heading: "As featured in",
  },
  video: {
    heading: "Watch a quick introduction",
  },
  courseGrid: {
    heading: "Explore the programs",
  },
  pricingPlans: {
    heading: "Plans & pricing",
    subheading:
      "Pick the plan that fits where you are right now — upgrade anytime.",
  },
  upcomingEvents: {
    heading: "Upcoming live sessions",
  },
  storeProducts: {
    heading: "From the shop",
  },
};

export const NICHE_EXAMPLES: Record<NicheKey, Record<string, BlockExample>> = {
  yoga: {
    hero: {
      heading: "Find Your Balance Through Yoga",
      subheading:
        "Transform your body and mind with guided yoga practices — whether you're a complete beginner or an experienced yogi.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "Why Practice With Me?",
      body: "<p>Every class blends mindful breathwork with safe, clear alignment so you can build a steady practice at your own pace. Roll out your mat, and let's grow stronger and calmer together.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Certified yoga instructor with over 12 years of teaching experience in Hatha, Vinyasa, and Ashtanga traditions. I believe yoga is a journey of self-discovery — meeting yourself on the mat with compassion, breath, and intention.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Priya R.",
          text: "These classes changed my life. The beginner course gave me a solid foundation, and now I practice every morning before work. My flexibility and focus have improved so much.",
        },
        {
          name: "Sarah L.",
          text: "The Vinyasa Flow course is beautifully structured. Each lesson builds on the last, and the cues are so clear that I always feel safe pushing my edge.",
        },
        {
          name: "Marcus T.",
          text: "I was skeptical about learning yoga online, but the video quality and detailed alignment instructions made it feel like a private session. Highly recommend!",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need to be flexible to start yoga?",
          a: "Absolutely not! Flexibility is a result of yoga, not a prerequisite. Our beginner course starts with gentle movements and modifications so you can practice safely at any level.",
        },
        {
          q: "What equipment do I need?",
          a: "A yoga mat is recommended but not required. You may also find blocks and a strap helpful for certain poses. Wear comfortable clothing that allows free movement.",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for practicing anywhere.",
        },
      ],
    },
    cta: {
      heading: "Ready to Begin Your Journey?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Join the Practice",
      items: [
        { value: "500+", label: "Students" },
        { value: "40+", label: "Guided classes" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New beginner series just added — start your practice today.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  pilates: {
    hero: {
      heading: "Transform Your Body with Pilates",
      subheading:
        "Build core strength, improve flexibility, and move with confidence through mindful, controlled movement.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "Why Train With Me?",
      body: "<p>Precise, controlled movement is at the heart of every session. We focus on form first, so you build a strong, balanced body safely — no gym, no reformer, just a mat and a little commitment.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Certified Pilates instructor with over 12 years of experience in mat and reformer Pilates. I specialise in helping people of all fitness levels build a strong, balanced body through precise, controlled movement — no gym required, just a mat and commitment.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Clara D.",
          text: "After just four weeks my posture improved dramatically. The lessons are clear, well-paced, and I can feel every muscle engaging properly.",
        },
        {
          name: "Marco T.",
          text: "I was sceptical about online Pilates, but the detailed cues and camera angles make it feel like a private session. My back pain is finally gone!",
        },
        {
          name: "Hana Y.",
          text: "The Full Body Sculpt course pushed me in the best way. I feel stronger, more flexible, and genuinely look forward to every workout.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need any equipment?",
          a: "All our courses are mat-based. You only need a yoga or Pilates mat and enough space to lie down and stretch your arms out. Optional props like a resistance band are noted in individual lessons.",
        },
        {
          q: "Is Pilates suitable for beginners?",
          a: "Absolutely! The Pilates Fundamentals course starts from scratch with breathing, alignment, and basic movements. No prior experience is needed.",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for practising anywhere.",
        },
      ],
    },
    cta: {
      heading: "Ready to Feel Stronger?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Move With Confidence",
      items: [
        { value: "500+", label: "Students" },
        { value: "30+", label: "Hours of video" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New mat-based programs just added — build strength at home.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  fitness: {
    hero: {
      heading: "Transform Your Body, Elevate Your Life",
      subheading:
        "Science-backed programs to build strength, burn fat, and boost your confidence — train anywhere with expert-led video workouts.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "Train Smarter, Not Harder",
      body: "<p>Every program is built on proven principles — functional training, HIIT, and smart strength progression. Follow along with clear form breakdowns and make professional-grade results accessible, no gym required.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Certified personal trainer and sports science graduate with over 8 years of coaching experience. I specialize in functional training, HIIT, and strength programming for all fitness levels. My mission is to make professional-grade training accessible to everyone — no gym required.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Marcus T.",
          text: "The Total Body Transformation program completely changed my routine. I lost 12 kg in three months and feel stronger than ever. The structured approach kept me accountable every single day.",
        },
        {
          name: "Sarah L.",
          text: "As a busy mom, I needed workouts I could do at home. The HIIT Power Program fits perfectly into my schedule — 30 minutes, maximum results. I have so much more energy now!",
        },
        {
          name: "David K.",
          text: "The Strength & Conditioning course gave me the foundation I was missing. My lifts have improved dramatically and I finally understand proper form and programming.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need any equipment?",
          a: "The Total Body Transformation course requires no equipment at all — just your bodyweight. The HIIT and Strength programs recommend dumbbells and a resistance band, but we always show bodyweight alternatives.",
        },
        {
          q: "I'm a complete beginner — is this for me?",
          a: "Absolutely! Each program includes form breakdowns and beginner modifications for every exercise. Start with the free Total Body Transformation course and progress at your own pace.",
        },
        {
          q: "Can I access the workouts on my phone?",
          a: "Yes! The platform is fully responsive. Stream lessons on your phone, tablet, or computer — perfect for training at home, in the gym, or while traveling.",
        },
      ],
    },
    cta: {
      heading: "Ready to Start Training?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Results That Add Up",
      items: [
        { value: "10k+", label: "Workouts completed" },
        { value: "50+", label: "Video sessions" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New HIIT program just dropped — train anywhere, anytime.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  face_yoga: {
    hero: {
      heading: "Natural Beauty Through Face Yoga",
      subheading:
        "Tone, lift, and rejuvenate your face with simple daily exercises — no injections, no products, just a few minutes a day.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "A Few Minutes a Day",
      body: "<p>Natural facial rejuvenation is all about consistency. These short, targeted routines use only your hands and your own muscles — simple enough to fit into your morning, effective enough to see and feel the difference.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Certified face yoga instructor and holistic wellness coach with over 6 years of experience. After seeing dramatic results in my own skin, I dedicated my career to teaching natural facial rejuvenation techniques that anyone can do at home.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Sarah W.",
          text: "After just three weeks of the Basics course, my jawline is noticeably more defined. I cannot believe something so simple actually works!",
        },
        {
          name: "Mei C.",
          text: "The Anti-Aging Routines course is my daily ritual now. My forehead lines have softened and my skin looks so much more lifted and radiant.",
        },
        {
          name: "Astrid N.",
          text: "Sculpt & Tone gave me cheekbones I did not know I had! The targeted exercises are so effective and only take ten minutes a day.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "How soon will I see results?",
          a: "Most students notice subtle changes within 2-3 weeks of daily practice. More significant lifting and toning typically appear after 6-8 weeks of consistent work.",
        },
        {
          q: "Do I need any equipment?",
          a: "No equipment at all! All exercises use your own hands and facial muscles. A mirror is helpful so you can check your form, but that is all you need.",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for following along during your morning routine.",
        },
      ],
    },
    cta: {
      heading: "Ready to Transform Your Face Naturally?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Naturally Radiant",
      items: [
        { value: "2k+", label: "Students" },
        { value: "5 min", label: "Daily routine" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New anti-aging routines just added — see results in weeks.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  belly_dance: {
    hero: {
      heading: "Discover the Art of Belly Dance",
      subheading:
        "Express yourself through the ancient art of belly dance — join our community of dancers and unlock your inner rhythm.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "Dance Is for Everyone",
      body: "<p>No experience needed — just an open heart and a love for movement. We start with posture and simple hip work, then build toward expressive combinations so you can dance with confidence and joy.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Passionate belly dance instructor with over 10 years of experience in Oriental, Tribal Fusion, and Classical Egyptian styles. I believe dance is for everyone — no experience needed, just an open heart and a love for movement.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Ayşe K.",
          text: "This academy transformed the way I move. The structured lessons made it so easy to build confidence in my shimmies and isolations.",
        },
        {
          name: "Leila M.",
          text: "I never imagined I could learn belly dance online, but the video quality and detailed breakdowns are incredible. I practice every single day!",
        },
        {
          name: "Nadia S.",
          text: "The choreography course is a masterpiece. I went from feeling lost on stage to performing with real expression and musicality.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need prior dance experience?",
          a: "Not at all! Our Belly Dance Basics course is designed for absolute beginners. We start with posture and simple hip movements before building up to combinations.",
        },
        {
          q: "What do I need to get started?",
          a: "All you need is comfortable clothing that lets you see your hip movements, a small open space, and a willingness to have fun. A hip scarf is optional but adds to the experience!",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for practicing anywhere.",
        },
      ],
    },
    cta: {
      heading: "Ready to Start Dancing?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Find Your Rhythm",
      items: [
        { value: "1k+", label: "Dancers" },
        { value: "35+", label: "Choreography lessons" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New choreography course just added — find your rhythm.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  pole_dance: {
    hero: {
      heading: "Unleash Your Strength on the Pole",
      subheading:
        "Build confidence, strength, and artistry through pole dance — whether you're a total beginner or mastering advanced tricks.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "Every Dancer Starts Somewhere",
      body: "<p>No gymnastics background required — just the courage to try something new. Detailed progressions build your strength step by step, so even the scary moves start to feel safe and within reach.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Certified pole dance instructor and competitor with over 8 years of teaching experience. My mission is to make pole dance accessible to all body types and fitness levels — no gymnastics background required, just the courage to try something new.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Jessica R.",
          text: "I was terrified of trying pole dance, but the Basics course broke everything down so clearly. I can now do a fireman spin and I feel incredible!",
        },
        {
          name: "Mia T.",
          text: "The spins and transitions course completely changed my flow. I went from clunky moves to smooth, connected sequences in just a few weeks.",
        },
        {
          name: "Priya D.",
          text: "Advanced Pole Tricks pushed me beyond what I thought was possible. The detailed progressions for each trick made even the scary inversions feel safe.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need to be strong to start?",
          a: "Not at all! Pole Basics is designed for complete beginners. You will build strength as you progress through the lessons. Everyone starts somewhere.",
        },
        {
          q: "What equipment do I need?",
          a: "You will need a pole (static or spinning) installed securely at home or access to a local studio. Wear shorts and a tank top so your skin can grip the pole.",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for following along in your practice space.",
        },
      ],
    },
    cta: {
      heading: "Ready to Own the Pole?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Build Real Strength",
      items: [
        { value: "800+", label: "Students" },
        { value: "40+", label: "Trick tutorials" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New beginner spins course just added — start where you are.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },

  makeup: {
    hero: {
      heading: "Master the Art of Makeup",
      subheading:
        "From everyday glam to editorial masterpieces, learn professional makeup techniques from the comfort of your home.",
      ctaText: "Browse Programs",
      ctaHref: "/courses",
    },
    richText: {
      heading: "From Everyday Glam to Editorial",
      body: "<p>Learn the techniques the pros use — flawless bases, seamless blending, and looks that last. Clear, step-by-step breakdowns make even advanced editorial styles feel achievable, whatever your kit.</p>",
    },
    imageText: {
      heading: "About Me",
      body: "<p>Professional makeup artist with over 12 years of experience in bridal, editorial, and fashion makeup. I have worked backstage at fashion weeks and with celebrity clients, and now I am passionate about sharing my techniques with aspiring artists around the world.</p>",
    },
    testimonials: {
      heading: "What Students Say",
      items: [
        {
          name: "Olivia H.",
          text: "The Everyday Glam course transformed my morning routine. I finally understand how to blend foundation properly and my skin looks flawless every day!",
        },
        {
          name: "Zara B.",
          text: "Bridal Makeup Mastery gave me the confidence to start freelancing as a bridal artist. The business tips alone were worth the investment.",
        },
        {
          name: "Hannah L.",
          text: "The editorial course blew my mind. I never thought I could create avant-garde looks, but the step-by-step breakdowns made it so accessible.",
        },
      ],
    },
    faq: {
      heading: "Frequently Asked Questions",
      items: [
        {
          q: "Do I need professional makeup products to start?",
          a: "Not at all! We recommend affordable drugstore alternatives for every product used in the courses. You can upgrade your kit as you progress.",
        },
        {
          q: "Are the techniques suitable for all skin types?",
          a: "Absolutely. Each lesson covers adaptations for dry, oily, combination, and sensitive skin. We also address techniques for a wide range of skin tones.",
        },
        {
          q: "Can I access the courses on mobile?",
          a: "Yes! The platform is fully responsive. You can stream lessons on your phone, tablet, or computer — perfect for following along at your vanity.",
        },
      ],
    },
    cta: {
      heading: "Ready to Glow Up?",
      buttonText: "Join Now",
      buttonHref: "/courses",
    },
    stats: {
      heading: "Join the Studio",
      items: [
        { value: "5k+", label: "Students" },
        { value: "60+", label: "Tutorials" },
        { value: "4.9★", label: "Average rating" },
      ],
    },
    banner: {
      text: "New bridal makeup masterclass just added — book your seat.",
      linkText: "Browse programs",
      linkHref: "/courses",
    },
  },
};

/** Example overrides for a block type, given an optional niche. Returns the
 *  niche-specific example, else the generic one, else `{}` (out-of-scope block
 *  types like media/dynamic). Never throws. */
export function exampleFor(type: string, niche?: string): BlockExample {
  const byNiche =
    niche && niche in NICHE_EXAMPLES
      ? NICHE_EXAMPLES[niche as NicheKey]
      : undefined;
  return byNiche?.[type] ?? GENERIC_EXAMPLES[type] ?? {};
}
