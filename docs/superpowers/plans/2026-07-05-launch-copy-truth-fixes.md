# Launch Copy Truth Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all fabricated social proof and false claims from the Contentor marketing site, rewrite the hero around the real differentiators, and replace the fake-testimonials section with a Founding Creators offer — in both EN and TR.

**Architecture:** The marketing site is `frontend-main/` (Next.js 14 App Router, next-intl). Almost all copy lives in `frontend-main/messages/{en,tr}/marketing.json` and `pricing.json`; landing sections are components in `frontend-main/src/components/landing/` composed by `frontend-main/src/app/page.tsx`. This plan is 4 JSON rewrites + 2 small component changes. No backend changes.

**Tech Stack:** Next.js 14, next-intl, Tailwind, lucide-react. No test framework exists in frontend-main — verification is: JSON key-parity checks, banned-string greps, prettier, and `next build`.

## Global Constraints

- **Source of truth for every plan number** is `backend/apps/core/management/commands/seed_plans.py`: Free = $0, 0% fee, 10 students, 1 GB, NO live classes, 100 campaign emails/mo, cannot sell; Starter = $19/mo, 8% fee, 100 students, 100 GB, 100 streaming hours/mo, 1,000 emails/mo, live enabled; Pro = $49/mo, 6% fee, 500 students, 500 GB, 500 streaming hours/mo, 5,000 emails/mo, live enabled. Never write any other number into copy.
- **Banned strings** — must not exist anywhere in `frontend-main/messages/` or `frontend-main/src/components/landing/` when done: `$1M`, `500+`, `500'den fazla`, `Sarah Chen`, `Marcus Johnson`, `Priya Sharma`, `PayPal`, `14-day`, `14 gün`, `10,000 students`, `10.000 öğrenci`, `Up to 50 students`, `50 öğrenciye`, `Unlimited students`, `Sınırsız öğrenci`.
- **EN/TR parity:** `messages/en/*.json` and `messages/tr/*.json` must have identical key sets after every task that touches them.
- Repo root: `~/ws/projects-active/home-server/contentor`. All paths below are relative to it.
- **Shared working tree warning:** other agents may work in this tree. Before creating the branch, verify `git status` is clean (except the two docs this plan commits) and note the base commit. Never push. Never commit to `main`.
- Do not create any new `.md` files.
- JSON files: 2-space indent, keep key order as written here, run `npx prettier --write` on every changed file before committing.

---

### Task 1: Branch setup + commit the strategy docs

**Files:**
- Commit (already created, untracked): `docs/LAUNCH.md`, `docs/superpowers/plans/2026-07-05-launch-copy-truth-fixes.md`

**Interfaces:**
- Produces: branch `feat/launch-copy-truth` that all later tasks commit to.

- [ ] **Step 1: Verify tree state and record base**

Run: `git -C ~/ws/projects-active/home-server/contentor status --porcelain && git -C ~/ws/projects-active/home-server/contentor log --oneline -1`
Expected: only untracked `docs/LAUNCH.md` and `docs/superpowers/plans/2026-07-05-launch-copy-truth-fixes.md` (possibly `docs/PRODUCT.md` modified — leave it alone). If other source files show as modified, STOP and report — another agent is mid-flight.

- [ ] **Step 2: Create the branch**

```bash
cd ~/ws/projects-active/home-server/contentor
git checkout -b feat/launch-copy-truth
```

- [ ] **Step 3: Commit the docs**

```bash
git add docs/LAUNCH.md docs/superpowers/plans/2026-07-05-launch-copy-truth-fixes.md
git commit -m "docs: launch strategy plan + copy-truth-fix implementation plan"
```

---

### Task 2: Rewrite `messages/en/marketing.json`

**Files:**
- Modify: `frontend-main/messages/en/marketing.json` (full replacement below)

**Interfaces:**
- Produces: i18n namespace `marketing.foundingCreators` with keys `eyebrow`, `title`, `subtitle`, `perks.{concierge,discount,featured}.{title,description}`, `cta`, `note` — consumed by the component in Task 6. Removes namespace `marketing.testimonials` entirely.

- [ ] **Step 1: Replace the entire file with exactly this content**

```json
{
  "hero": {
    "badge": "Free plan available — no credit card required",
    "title1": "Your own course platform.",
    "title2": "Your brand. Your money.",
    "subtitle": "Courses, live classes, and payments under your own name — your students never see ours. Launch in minutes; payments go straight to your Stripe account.",
    "ctaPrimary": "Create your platform free",
    "ctaSecondary": "Explore live demos",
    "trustNote": "Free forever plan. No credit card. You own your students, your content, and your revenue."
  },
  "socialProof": {
    "tagline": "Built for yoga instructors, fitness coaches, music teachers, dance academies, and every coach who teaches online",
    "categories": {
      "fitness": "Fitness",
      "music": "Music",
      "dance": "Dance",
      "education": "Education",
      "wellness": "Wellness"
    }
  },
  "stats": {
    "earned": {
      "value": "$19",
      "label": "Per month for what costs $149+ on legacy platforms"
    },
    "students": {
      "value": "100%",
      "label": "Your brand — students never see Contentor"
    },
    "launch": {
      "value": "5 min",
      "label": "From signup to a live platform"
    }
  },
  "features": {
    "title": "Built for creators who mean business",
    "subtitle": "From course creation to payments, live teaching to automation — everything under your brand.",
    "illustrations": {
      "progress": "Progress",
      "lessonsCount": "{count} lessons",
      "live": "LIVE",
      "watchingCount": "{count} watching",
      "automationStep3": "Send welcome offer"
    },
    "items": {
      "courses": {
        "title": "Courses that sell themselves",
        "description": "Build rich, structured courses with modules, lessons, and video content that keep students engaged from start to finish.",
        "points": {
          "video": "Video lessons with progress tracking",
          "modular": "Modular course structure",
          "enrollment": "Student enrollment management",
          "drip": "One-time prices or subscriptions"
        }
      },
      "live": {
        "title": "Live classes, chat, and recordings",
        "description": "Run real-time sessions with your students. Teach, interact, and record — all from one place.",
        "points": {
          "webrtc": "WebRTC video conferencing",
          "chat": "Live chat during sessions",
          "recording": "Session recordings",
          "scheduling": "Scheduling and reminders"
        }
      },
      "branding": {
        "title": "100% your brand, zero Contentor branding",
        "description": "Your platform, your identity. Fully white-label with your own domain, colors, and typography — students never see us.",
        "points": {
          "domain": "Custom domain support",
          "colors": "Brand colors and typography",
          "whitelabel": "White-label experience",
          "mobile": "Mobile-ready PWA"
        }
      },
      "autopilot": {
        "title": "Autopilot revenue",
        "description": "Automate the repetitive tasks and earn steadily. From email campaigns to subscription billing, let the system work for you.",
        "points": {
          "email": "Email campaigns to your students",
          "subscriptions": "Recurring subscription billing",
          "stripe": "Payments straight to your Stripe",
          "automation": "Student progress tracking"
        }
      }
    }
  },
  "foundingCreators": {
    "eyebrow": "Founding creators",
    "title": "Be one of our first 20 coaches",
    "subtitle": "We're launching Contentor with a small group of founding creators — set up personally, one on one, by the founder.",
    "perks": {
      "concierge": {
        "title": "We build your platform with you",
        "description": "A 1-on-1 onboarding call where we set up your site, courses, and payments together — you bring the content, we do the rest."
      },
      "discount": {
        "title": "50% off for 12 months",
        "description": "Lock in founding pricing on Starter or Pro for your entire first year."
      },
      "featured": {
        "title": "Featured on this page",
        "description": "Your school showcased here as a founding creator — free exposure to every visitor."
      }
    },
    "cta": "Claim a founding spot",
    "note": "Limited to 20 coaches. When they're gone, they're gone."
  },
  "howItWorks": {
    "title": "Up and running in minutes",
    "steps": {
      "one": {
        "title": "Create your free account",
        "description": "Sign up in under 2 minutes. No credit card required."
      },
      "two": {
        "title": "Upload your content",
        "description": "Add courses, set your prices, and customize your brand."
      },
      "three": {
        "title": "Start earning",
        "description": "Share your link and watch the revenue come in."
      }
    }
  },
  "faq": {
    "title": "Frequently asked questions",
    "subtitle": "Everything you need to know to get started.",
    "items": {
      "freePlan": {
        "q": "Is there really a free plan?",
        "a": "Yes! Our free plan is free forever — no credit card required. You get up to 10 students and 1 GB of storage: enough to build your platform and run it with a small group. Selling and live classes unlock on paid plans — upgrade anytime as you grow."
      },
      "technical": {
        "q": "Do I need technical skills?",
        "a": "Not at all. If you can use social media, you can use Contentor. Everything is drag-and-drop with no coding required."
      },
      "customDomain": {
        "q": "Can I use my own domain?",
        "a": "Yes — on the Pro plan you can connect your own custom domain. And on every paid plan your platform runs fully under your brand: your students never see Contentor."
      },
      "payments": {
        "q": "How do payments work?",
        "a": "We integrate directly with Stripe. Payments go straight to your own Stripe account — we never hold your money. You can sell one-time courses or recurring subscriptions."
      },
      "liveClasses": {
        "q": "How do live classes work?",
        "a": "Live classes are included on every paid plan — WebRTC video with built-in chat, scheduling, and reminders. Starter includes 100 streaming hours per month, Pro includes 500."
      },
      "migration": {
        "q": "Can I migrate from another platform?",
        "a": "Yes. Most coaches rebuild their courses with our builder and invite their students by email within a day. As a founding creator, we'll help you migrate personally — hands-on and free."
      },
      "contract": {
        "q": "Is there a long-term contract?",
        "a": "No contracts, no commitments. All plans are month-to-month. You can cancel or change plans anytime."
      }
    }
  },
  "finalCta": {
    "title": "Your audience is waiting",
    "subtitle": "Launch your platform free today — and claim one of the 20 founding-creator spots while they last.",
    "ctaPrimary": "Start Free Today",
    "ctaSecondary": "See pricing",
    "trustNote": "Free forever plan. No credit card required."
  }
}
```

- [ ] **Step 2: Verify it parses and the old proof is gone from this file**

```bash
cd ~/ws/projects-active/home-server/contentor/frontend-main
node -e "require('./messages/en/marketing.json'); console.log('json OK')"
grep -c "Sarah Chen\|Marcus Johnson\|Priya Sharma\|\\\$1M\|500+\|10,000 students\|testimonials" messages/en/marketing.json || echo "clean"
```
Expected: `json OK` then `clean` (grep finds nothing, exits non-zero, prints `clean`).

- [ ] **Step 3: Format and commit**

```bash
cd ~/ws/projects-active/home-server/contentor
npx --prefix frontend-main prettier --write frontend-main/messages/en/marketing.json
git add frontend-main/messages/en/marketing.json
git commit -m "fix(marketing): remove fabricated social proof, rewrite hero around white-label wedge (EN)"
```

---

### Task 3: Rewrite `messages/tr/marketing.json` (mirror of Task 2)

**Files:**
- Modify: `frontend-main/messages/tr/marketing.json` (full replacement below)

**Interfaces:**
- Consumes: key structure defined in Task 2 — TR must match it key-for-key.

- [ ] **Step 1: Replace the entire file with exactly this content**

```json
{
  "hero": {
    "badge": "Ücretsiz plan mevcut — kredi kartı gerekmez",
    "title1": "Kendi kurs platformunuz.",
    "title2": "Sizin markanız. Sizin kazancınız.",
    "subtitle": "Kurslar, canlı dersler ve ödemeler — hepsi kendi adınız altında; öğrencileriniz bizi asla görmez. Dakikalar içinde yayına girin; ödemeler doğrudan kendi Stripe hesabınıza gider.",
    "ctaPrimary": "Platformunu ücretsiz oluştur",
    "ctaSecondary": "Canlı demoları keşfet",
    "trustNote": "Sonsuza dek ücretsiz plan. Kredi kartı yok. Öğrenciler, içerik ve gelir tamamen sizin."
  },
  "socialProof": {
    "tagline": "Yoga eğitmenleri, fitness koçları, müzik öğretmenleri, dans akademileri ve online ders veren tüm koçlar için tasarlandı",
    "categories": {
      "fitness": "Fitness",
      "music": "Müzik",
      "dance": "Dans",
      "education": "Eğitim",
      "wellness": "Sağlık"
    }
  },
  "stats": {
    "earned": {
      "value": "$19",
      "label": "Eski platformlarda $149+ tutan her şey, ayda bu fiyata"
    },
    "students": {
      "value": "%100",
      "label": "Sizin markanız — öğrenciler Contentor'u asla görmez"
    },
    "launch": {
      "value": "5 dk",
      "label": "Kayıttan yayındaki platforma"
    }
  },
  "features": {
    "title": "İşini ciddiye alan üreticiler için tasarlandı",
    "subtitle": "Kurs oluşturmaktan ödemelere, canlı eğitimden otomasyona — hepsi kendi markanız altında.",
    "illustrations": {
      "progress": "İlerleme",
      "lessonsCount": "{count} ders",
      "live": "CANLI",
      "watchingCount": "{count} izleyici",
      "automationStep3": "Hoş geldin teklifi gönder"
    },
    "items": {
      "courses": {
        "title": "Kendi kendini satan kurslar",
        "description": "Modüller, dersler ve video içerikleriyle baştan sona ilgi çekici kurslar oluşturun.",
        "points": {
          "video": "İlerleme takipli video dersler",
          "modular": "Modüler kurs yapısı",
          "enrollment": "Öğrenci kayıt yönetimi",
          "drip": "Tek seferlik fiyat veya abonelik"
        }
      },
      "live": {
        "title": "Canlı dersler, sohbet ve kayıtlar",
        "description": "Öğrencilerinizle gerçek zamanlı oturumlar yapın. Öğretin, etkileşin ve kaydedin — hepsi tek yerden.",
        "points": {
          "webrtc": "WebRTC video konferans",
          "chat": "Oturum sırasında canlı sohbet",
          "recording": "Oturum kayıtları",
          "scheduling": "Zamanlama ve hatırlatmalar"
        }
      },
      "branding": {
        "title": "%100 sizin markanız, hiç Contentor markası yok",
        "description": "Platformunuz, kimliğiniz. Kendi alan adınız, renkleriniz ve tipografinizle tamamen beyaz etiketli — öğrenciler bizi asla görmez.",
        "points": {
          "domain": "Özel alan adı desteği",
          "colors": "Marka renkleri ve tipografi",
          "whitelabel": "Beyaz etiketli deneyim",
          "mobile": "Mobil uyumlu PWA"
        }
      },
      "autopilot": {
        "title": "Otomatik pilot gelir",
        "description": "Tekrarlayan görevleri otomatikleştirin ve düzenli kazanın. E-posta kampanyalarından abonelik faturalamasına kadar sistem sizin için çalışsın.",
        "points": {
          "email": "Öğrencilerinize e-posta kampanyaları",
          "subscriptions": "Yinelenen abonelik faturalandırması",
          "stripe": "Ödemeler doğrudan Stripe hesabınıza",
          "automation": "Öğrenci ilerleme takibi"
        }
      }
    }
  },
  "foundingCreators": {
    "eyebrow": "Kurucu üreticiler",
    "title": "İlk 20 koçumuzdan biri olun",
    "subtitle": "Contentor'u küçük bir kurucu üretici grubuyla başlatıyoruz — kurulumunuzu bizzat kurucuyla birlikte, birebir yaparsınız.",
    "perks": {
      "concierge": {
        "title": "Platformunuzu birlikte kuruyoruz",
        "description": "Birebir görüşmede sitenizi, kurslarınızı ve ödemelerinizi birlikte ayarlıyoruz — siz içeriği getirin, gerisi bizde."
      },
      "discount": {
        "title": "12 ay boyunca %50 indirim",
        "description": "Starter veya Pro planında kurucu fiyatını ilk yılınız boyunca sabitleyin."
      },
      "featured": {
        "title": "Bu sayfada yer alın",
        "description": "Okulunuz kurucu üretici olarak burada sergilenir — her ziyaretçiye ücretsiz tanıtım."
      }
    },
    "cta": "Kurucu üretici yerini ayırt",
    "note": "20 koçla sınırlı. Dolunca kapanır."
  },
  "howItWorks": {
    "title": "Dakikalar içinde yayında",
    "steps": {
      "one": {
        "title": "Ücretsiz hesabınızı oluşturun",
        "description": "2 dakikadan kısa sürede kaydolun. Kredi kartı gerekmez."
      },
      "two": {
        "title": "İçeriğinizi yükleyin",
        "description": "Kurslar ekleyin, fiyatlarınızı belirleyin ve markanızı özelleştirin."
      },
      "three": {
        "title": "Kazanmaya başlayın",
        "description": "Bağlantınızı paylaşın ve gelirin akmasını izleyin."
      }
    }
  },
  "faq": {
    "title": "Sıkça sorulan sorular",
    "subtitle": "Başlamak için bilmeniz gereken her şey.",
    "items": {
      "freePlan": {
        "q": "Gerçekten ücretsiz bir plan var mı?",
        "a": "Evet! Ücretsiz planımız sonsuza dek ücretsiz — kredi kartı gerekmez. 10 öğrenciye kadar ve 1 GB depolama içerir: platformunuzu kurup küçük bir grupla denemek için yeterli. Satış ve canlı dersler ücretli planlarla açılır — büyüdükçe istediğiniz zaman yükseltin."
      },
      "technical": {
        "q": "Teknik bilgiye ihtiyacım var mı?",
        "a": "Hiç değil. Sosyal medyayı kullanabiliyorsanız, Contentor'u da kullanabilirsiniz. Her şey sürükle-bırak, kodlama yok."
      },
      "customDomain": {
        "q": "Kendi alan adımı kullanabilir miyim?",
        "a": "Evet — Pro planda kendi özel alan adınızı bağlayabilirsiniz. Üstelik tüm ücretli planlarda platformunuz tamamen kendi markanızla çalışır: öğrencileriniz Contentor'u asla görmez."
      },
      "payments": {
        "q": "Ödemeler nasıl çalışır?",
        "a": "Doğrudan Stripe ile entegre çalışıyoruz. Ödemeler doğrudan kendi Stripe hesabınıza geçer — paranızı asla tutmayız. Tek seferlik kurslar veya yinelenen abonelikler satabilirsiniz."
      },
      "liveClasses": {
        "q": "Canlı dersler nasıl çalışır?",
        "a": "Canlı dersler tüm ücretli planlara dahildir — WebRTC video, dahili sohbet, zamanlama ve hatırlatmalar. Starter ayda 100 yayın saati, Pro 500 yayın saati içerir."
      },
      "migration": {
        "q": "Başka bir platformdan taşınabilir miyim?",
        "a": "Evet. Çoğu koç kurslarını oluşturucumuzla bir günde yeniden kurup öğrencilerini e-postayla davet ediyor. Kurucu üretici olarak taşınmanızda size bizzat ve ücretsiz yardım ediyoruz."
      },
      "contract": {
        "q": "Uzun vadeli bir sözleşme var mı?",
        "a": "Sözleşme yok, taahhüt yok. Tüm planlar aylıktır. İstediğiniz zaman iptal edebilir veya plan değiştirebilirsiniz."
      }
    }
  },
  "finalCta": {
    "title": "Kitleniz sizi bekliyor",
    "subtitle": "Platformunuzu bugün ücretsiz başlatın — ve 20 kurucu üretici yerinden birini kapın.",
    "ctaPrimary": "Bugün ücretsiz başla",
    "ctaSecondary": "Fiyatlara bak",
    "trustNote": "Sonsuza dek ücretsiz plan. Kredi kartı gerekmez."
  }
}
```

- [ ] **Step 2: Verify parse + EN/TR key parity**

```bash
cd ~/ws/projects-active/home-server/contentor/frontend-main
node -e "
const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?flat(v,p+k+'.'):[p+k]);
const en=flat(require('./messages/en/marketing.json')).sort();
const tr=flat(require('./messages/tr/marketing.json')).sort();
const miss=[...en.filter(k=>!tr.includes(k)),...tr.filter(k=>!en.includes(k))];
if(miss.length){console.error('MISMATCH',miss);process.exit(1)}
console.log('parity OK',en.length,'keys')"
```
Expected: `parity OK <n> keys`

- [ ] **Step 3: Format and commit**

```bash
cd ~/ws/projects-active/home-server/contentor
npx --prefix frontend-main prettier --write frontend-main/messages/tr/marketing.json
git add frontend-main/messages/tr/marketing.json
git commit -m "fix(marketing): mirror truth-fixed landing copy in Turkish"
```

---

### Task 4: Fix `pricing.json` (EN + TR) — trial/PayPal lies + backend-true fallbacks

**Files:**
- Modify: `frontend-main/messages/en/pricing.json` (full replacement below)
- Modify: `frontend-main/messages/tr/pricing.json` (full replacement below)

**Interfaces:**
- Consumes: nothing new. Note: `pricing/page.tsx` overrides students/storage/fee/campaigns bullets from the live plans API (`dynamicFeatureLabel`); these JSON values are the API-down fallback and must still match `seed_plans.py`.

- [ ] **Step 1: Replace `messages/en/pricing.json` with exactly this content**

```json
{
  "title": "Simple, transparent pricing",
  "subtitle": "Start free and scale as you grow. No hidden fees.",
  "popular": "Popular",
  "cta": "Get Started",
  "ctaProcessing": "Processing...",
  "errors": {
    "priceNotAvailable": "Pricing for your region isn't available yet. Please contact support.",
    "generic": "Something went wrong starting checkout. Please try again."
  },
  "periods": {
    "forever": "forever",
    "monthly": "/month"
  },
  "plans": {
    "free": {
      "name": "Free",
      "price": "$0",
      "period": "forever",
      "description": "Get started with the basics. Perfect for testing the waters.",
      "features": {
        "students": "Up to 10 students",
        "storage": "1 GB storage",
        "courseBuilder": "Basic course builder",
        "support": "Community support",
        "fee": "0% transaction fee",
        "live": "Live classes",
        "branding": "Custom branding",
        "domain": "Custom domain"
      },
      "included": ["students", "storage", "courseBuilder", "support", "fee"]
    },
    "starter": {
      "name": "Starter",
      "price": "$19",
      "period": "/month",
      "description": "For growing creators ready to scale their business.",
      "features": {
        "students": "Up to 100 students",
        "storage": "100 GB storage",
        "courseBuilder": "Advanced course builder",
        "live": "Live classes",
        "branding": "Custom branding",
        "campaigns": "Email campaigns (1,000/mo)",
        "fee": "8% transaction fee",
        "domain": "Custom domain"
      },
      "included": ["students", "storage", "courseBuilder", "live", "branding", "campaigns", "fee"]
    },
    "pro": {
      "name": "Pro",
      "price": "$49",
      "period": "/month",
      "description": "For established businesses that need everything.",
      "features": {
        "students": "Up to 500 students",
        "storage": "500 GB storage",
        "courseBuilder": "Advanced course builder",
        "live": "Live classes & streaming",
        "domain": "Custom domain",
        "campaigns": "Email campaigns (5,000/mo)",
        "fee": "6% transaction fee",
        "support": "Priority support"
      },
      "included": ["students", "storage", "courseBuilder", "live", "domain", "campaigns", "fee", "support"]
    }
  },
  "faq": {
    "title": "Frequently asked questions",
    "items": {
      "switch": {
        "q": "Can I switch plans at any time?",
        "a": "Yes. You can upgrade or downgrade your plan at any time. Changes take effect immediately and billing is prorated."
      },
      "trial": {
        "q": "Is there a free trial?",
        "a": "Better — there's a free forever plan. Build your entire platform on it with no credit card and no time limit, and upgrade only when you're ready to sell."
      },
      "payments": {
        "q": "What payment methods do you accept?",
        "a": "All major credit and debit cards, processed by Stripe. Payments from your students go directly to your own Stripe account — we never hold your money."
      },
      "limits": {
        "q": "What happens if I exceed my plan limits?",
        "a": "We will notify you when you approach your limits. You can upgrade at any time to get more capacity without losing any data."
      }
    }
  },
  "cta2": {
    "title": "Ready to get started?",
    "subtitle": "Launch free today and grow with us as a founding creator.",
    "button": "Get Started",
    "trustNote": "Free plan available. No credit card required."
  },
  "comingSoon": "Pricing for your region is coming soon",
  "comingSoonNote": "We're finalizing local pricing. Please check back shortly."
}
```

- [ ] **Step 2: Replace `messages/tr/pricing.json` with exactly this content**

```json
{
  "title": "Basit, şeffaf fiyatlandırma",
  "subtitle": "Ücretsiz başla, büyüdükçe ölçeklen. Gizli ücret yok.",
  "popular": "Popüler",
  "cta": "Başla",
  "ctaProcessing": "İşleniyor...",
  "errors": {
    "priceNotAvailable": "Bölgeniz için fiyatlandırma henüz mevcut değil. Lütfen destek ile iletişime geçin.",
    "generic": "Ödeme başlatılırken bir sorun oluştu. Lütfen tekrar deneyin."
  },
  "periods": {
    "forever": "sonsuza dek",
    "monthly": "/ay"
  },
  "plans": {
    "free": {
      "name": "Ücretsiz",
      "price": "₺0",
      "period": "sonsuza dek",
      "description": "Temel özelliklerle başlayın. Suyun sıcaklığını ölçmek için ideal.",
      "features": {
        "students": "10 öğrenciye kadar",
        "storage": "1 GB depolama",
        "courseBuilder": "Temel kurs oluşturucu",
        "support": "Topluluk desteği",
        "fee": "%0 işlem ücreti",
        "live": "Canlı dersler",
        "branding": "Özel markalama",
        "domain": "Özel alan adı"
      },
      "included": ["students", "storage", "courseBuilder", "support", "fee"]
    },
    "starter": {
      "name": "Başlangıç",
      "price": "₺599",
      "period": "/ay",
      "description": "İşini büyütmeye hazır üreticiler için.",
      "features": {
        "students": "100 öğrenciye kadar",
        "storage": "100 GB depolama",
        "courseBuilder": "Gelişmiş kurs oluşturucu",
        "live": "Canlı dersler",
        "branding": "Özel markalama",
        "campaigns": "E-posta kampanyaları (1.000/ay)",
        "fee": "%8 işlem ücreti",
        "domain": "Özel alan adı"
      },
      "included": ["students", "storage", "courseBuilder", "live", "branding", "campaigns", "fee"]
    },
    "pro": {
      "name": "Pro",
      "price": "₺1.499",
      "period": "/ay",
      "description": "Her şeye ihtiyaç duyan yerleşik işletmeler için.",
      "features": {
        "students": "500 öğrenciye kadar",
        "storage": "500 GB depolama",
        "courseBuilder": "Gelişmiş kurs oluşturucu",
        "live": "Canlı dersler ve yayın",
        "domain": "Özel alan adı",
        "campaigns": "E-posta kampanyaları (5.000/ay)",
        "fee": "%6 işlem ücreti",
        "support": "Öncelikli destek"
      },
      "included": ["students", "storage", "courseBuilder", "live", "domain", "campaigns", "fee", "support"]
    }
  },
  "faq": {
    "title": "Sıkça sorulan sorular",
    "items": {
      "switch": {
        "q": "Planlar arasında istediğim zaman geçebilir miyim?",
        "a": "Evet. Planınızı istediğiniz zaman yükseltebilir veya düşürebilirsiniz. Değişiklikler hemen geçerli olur ve faturalandırma oranlı yapılır."
      },
      "trial": {
        "q": "Ücretsiz deneme var mı?",
        "a": "Daha iyisi var: sonsuza dek ücretsiz plan. Kredi kartı ve süre sınırı olmadan tüm platformunuzu kurun; satışa hazır olduğunuzda yükseltin."
      },
      "payments": {
        "q": "Hangi ödeme yöntemlerini kabul ediyorsunuz?",
        "a": "Stripe üzerinden tüm büyük kredi ve banka kartları. Öğrencilerinizin ödemeleri doğrudan kendi Stripe hesabınıza gider — paranızı asla tutmayız."
      },
      "limits": {
        "q": "Plan limitlerimi aşarsam ne olur?",
        "a": "Limitlerinize yaklaşırken sizi bilgilendireceğiz. Veri kaybı olmadan daha fazla kapasite için istediğiniz zaman yükseltebilirsiniz."
      }
    }
  },
  "cta2": {
    "title": "Başlamaya hazır mısınız?",
    "subtitle": "Bugün ücretsiz başlayın ve kurucu üretici olarak bizimle büyüyün.",
    "button": "Başla",
    "trustNote": "Ücretsiz plan mevcut. Kredi kartı gerekmez."
  },
  "comingSoon": "Türkiye için fiyatlandırma yakında",
  "comingSoonNote": "Yerel fiyatları belirliyoruz. Kısa süre içinde tekrar göz atın."
}
```

- [ ] **Step 3: Verify parse + parity**

```bash
cd ~/ws/projects-active/home-server/contentor/frontend-main
node -e "
const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null&&!Array.isArray(v)?flat(v,p+k+'.'):[p+k]);
const en=flat(require('./messages/en/pricing.json')).sort();
const tr=flat(require('./messages/tr/pricing.json')).sort();
const miss=[...en.filter(k=>!tr.includes(k)),...tr.filter(k=>!en.includes(k))];
if(miss.length){console.error('MISMATCH',miss);process.exit(1)}
console.log('parity OK',en.length,'keys')"
```
Expected: `parity OK <n> keys`

- [ ] **Step 4: Format and commit**

```bash
cd ~/ws/projects-active/home-server/contentor
npx --prefix frontend-main prettier --write frontend-main/messages/en/pricing.json frontend-main/messages/tr/pricing.json
git add frontend-main/messages/en/pricing.json frontend-main/messages/tr/pricing.json
git commit -m "fix(pricing): remove false trial/PayPal/invoice claims, align fallback numbers with seeded plans"
```

---

### Task 5: Point the hero secondary CTA at the live demo gallery

**Files:**
- Modify: `frontend-main/src/components/landing/hero-section.tsx` (one link)

**Interfaces:**
- Consumes: `/demo` route (exists: `frontend-main/src/app/demo/page.tsx`, a gallery of 7 live read-only demo tenants). Label comes from `marketing.hero.ctaSecondary` (already updated to "Explore live demos" in Tasks 2–3).

- [ ] **Step 1: Change the link target**

In `frontend-main/src/components/landing/hero-section.tsx`, find:

```tsx
          <Button asChild variant="outline" size="xl">
            <Link href="#features">
              <Play />
              {t("ctaSecondary")}
            </Link>
          </Button>
```

Replace with:

```tsx
          <Button asChild variant="outline" size="xl">
            <Link href="/demo">
              <Play />
              {t("ctaSecondary")}
            </Link>
          </Button>
```

- [ ] **Step 2: Commit**

```bash
cd ~/ws/projects-active/home-server/contentor
git add frontend-main/src/components/landing/hero-section.tsx
git commit -m "fix(landing): hero secondary CTA links to the live demo gallery instead of #features"
```

---

### Task 6: Replace fake testimonials with the Founding Creators section

**Files:**
- Create: `frontend-main/src/components/landing/founding-creators-section.tsx`
- Delete: `frontend-main/src/components/landing/testimonials-section.tsx`
- Modify: `frontend-main/src/app/page.tsx` (swap the import + usage)

**Interfaces:**
- Consumes: i18n namespace `marketing.foundingCreators` (Task 2/3); `ScrollReveal` from `@/components/landing/scroll-reveal` (props: `direction`, `duration`, `delay`); `Button` from `@/components/ui/button` (supports `asChild`, `size="xl"`).
- Produces: `FoundingCreatorsSection` (no props), used by `page.tsx`.

- [ ] **Step 1: Create `frontend-main/src/components/landing/founding-creators-section.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, Handshake, Percent, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const PERKS = [
  { key: "concierge", Icon: Handshake },
  { key: "discount", Icon: Percent },
  { key: "featured", Icon: Star },
] as const;

export function FoundingCreatorsSection() {
  const t = useTranslations("marketing.foundingCreators");
  return (
    <section className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal direction="up" duration={0.7}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground">{t("eyebrow")}</p>
            <h2 className="text-display mt-4 text-4xl text-foreground md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PERKS.map(({ key, Icon }, i) => (
            <ScrollReveal key={key} direction="up" duration={0.7} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-xl border bg-card p-7 shadow-sm">
                <div className="flex size-10 items-center justify-center rounded-lg bg-marketing-accent/15">
                  <Icon className="size-5 text-marketing-accent" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-foreground">
                  {t(`perks.${key}.title`)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`perks.${key}.description`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal direction="up" duration={0.7} delay={0.2}>
          <div className="mt-12 flex flex-col items-center gap-3">
            <Button asChild size="xl">
              <Link href="/signup">
                {t("cta")}
                <ArrowRight />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">{t("note")}</p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Swap it into `frontend-main/src/app/page.tsx`**

Find:

```tsx
import { TestimonialsSection } from '@/components/landing/testimonials-section'
```

Replace with:

```tsx
import { FoundingCreatorsSection } from '@/components/landing/founding-creators-section'
```

Find:

```tsx
      <ScrollReveal direction="up" duration={0.7}>
        <TestimonialsSection />
      </ScrollReveal>
```

Replace with:

```tsx
      <ScrollReveal direction="up" duration={0.7}>
        <FoundingCreatorsSection />
      </ScrollReveal>
```

- [ ] **Step 3: Delete the old component and confirm nothing else imports it**

```bash
cd ~/ws/projects-active/home-server/contentor
rm frontend-main/src/components/landing/testimonials-section.tsx
grep -rn "testimonials-section\|TestimonialsSection" frontend-main/src || echo "no references"
```
Expected: `no references`

- [ ] **Step 4: Format and commit**

```bash
cd ~/ws/projects-active/home-server/contentor
npx --prefix frontend-main prettier --write frontend-main/src/components/landing/founding-creators-section.tsx frontend-main/src/app/page.tsx
git add -A frontend-main/src/components/landing frontend-main/src/app/page.tsx
git commit -m "feat(landing): replace fabricated testimonials with Founding Creators offer section"
```

---

### Task 7: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Banned-strings sweep (Global Constraints list)**

```bash
cd ~/ws/projects-active/home-server/contentor
grep -rn -e '$1M' -e '500+' -e "500'den fazla" -e 'Sarah Chen' -e 'Marcus Johnson' -e 'Priya Sharma' -e 'PayPal' -e '14-day' -e '14 gün' -e '10,000 students' -e '10.000 öğrenci' -e 'Up to 50 students' -e '50 öğrenciye' -e 'Unlimited students' -e 'Sınırsız öğrenci' \
  frontend-main/messages frontend-main/src/components/landing && echo "FOUND BANNED STRINGS — FIX" || echo "clean"
```
Expected: `clean`

- [ ] **Step 2: Production build**

```bash
cd ~/ws/projects-active/home-server/contentor/frontend-main
npm install
npm run build
```
Expected: `next build` completes with no type errors ("Compiled successfully"). API-dependent pages may log fetch warnings during static generation — that's fine; only type/compile errors are failures.

- [ ] **Step 3: Visual smoke (only if the dev stack is available)**

```bash
cd ~/ws/projects-active/home-server/contentor
make dev
```
Then load `http://localhost` and verify: new hero copy; "Explore live demos" opens `/demo`; stats show $19 / 100% / 5 min; Founding Creators section renders 3 perk cards; `/pricing` FAQ has no trial/PayPal claims. Check `http://tr.localhost` renders the Turkish equivalents. If the stack can't run in this environment, note it in the final report instead — do not claim visual verification.

- [ ] **Step 4: Report**

Summarize: commits on `feat/launch-copy-truth`, verification results, and any deviations. Do NOT push and do NOT merge to main — the owner reviews first.
