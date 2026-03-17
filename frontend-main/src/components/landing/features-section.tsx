import { BookOpen, Check, Globe, Video, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  title: string;
  icon: LucideIcon;
  description: string;
  points: string[];
  illustration: React.ReactNode;
}

function CourseIllustration() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Course card 1 */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="h-16 rounded-t-lg bg-primary/10" />
        <div className="space-y-3 p-3">
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Progress</span>
              <span>75%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div className="h-1.5 w-3/4 rounded-full bg-primary" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">12 lessons</p>
        </div>
      </div>
      {/* Course card 2 */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="h-16 rounded-t-lg bg-accent/10" />
        <div className="space-y-3 p-3">
          <div className="h-3 w-2/3 rounded bg-gray-200" />
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Progress</span>
              <span>40%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div className="h-1.5 w-2/5 rounded-full bg-accent" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">8 lessons</p>
        </div>
      </div>
    </div>
  );
}

function LiveClassIllustration() {
  return (
    <div className="overflow-hidden rounded-lg bg-gray-900 p-4">
      {/* Top bar */}
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          LIVE
        </span>
      </div>
      {/* Participant grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
      </div>
      {/* Bottom bar */}
      <div className="mt-3 text-center">
        <span className="text-xs text-gray-400">847 watching</span>
      </div>
    </div>
  );
}

function BrandingIllustration() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Browser 1 — primary brand */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="h-2 bg-primary" />
        <div className="space-y-2 p-2">
          <div className="h-8 rounded bg-primary/5" />
          <div className="h-2 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
      {/* Browser 2 — accent brand */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="h-2 bg-accent" />
        <div className="space-y-2 p-2">
          <div className="h-8 rounded bg-accent/5" />
          <div className="h-2 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function AutomationIllustration() {
  return (
    <div className="flex flex-col items-center gap-0">
      {/* Step 1 */}
      <div className="w-full rounded-lg border bg-white px-4 py-3 text-center text-sm font-medium shadow-sm">
        Student enrolls
      </div>
      {/* Arrow */}
      <div className="flex h-8 flex-col items-center justify-center">
        <div className="h-full w-px bg-gray-300" />
        <div className="h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300" />
      </div>
      {/* Step 2 */}
      <div className="w-full rounded-lg border bg-white px-4 py-3 text-center text-sm font-medium shadow-sm">
        Wait 3 days
      </div>
      {/* Arrow */}
      <div className="flex h-8 flex-col items-center justify-center">
        <div className="h-full w-px bg-gray-300" />
        <div className="h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300" />
      </div>
      {/* Step 3 */}
      <div className="w-full rounded-lg border bg-primary/5 px-4 py-3 text-center text-sm font-medium shadow-sm">
        Send welcome offer
      </div>
    </div>
  );
}

const features: Feature[] = [
  {
    title: "Courses that sell themselves",
    icon: BookOpen,
    description:
      "Build rich, structured courses with modules, lessons, and video content that keep students engaged from start to finish.",
    points: [
      "Video lessons with progress tracking",
      "Modular course structure",
      "Student enrollment management",
      "Drip scheduling and upsells",
    ],
    illustration: <CourseIllustration />,
  },
  {
    title: "Live classes for up to 10,000 students",
    icon: Video,
    description:
      "Run real-time sessions with your audience at any scale. Teach, interact, and record — all from one place.",
    points: [
      "WebRTC video conferencing",
      "Live chat during sessions",
      "Automatic recording to cloud",
      "Scheduling and reminders",
    ],
    illustration: <LiveClassIllustration />,
  },
  {
    title: "100% your brand, zero Contentor branding",
    icon: Globe,
    description:
      "Your platform, your identity. Fully white-label with your own domain, colors, and typography — students never see us.",
    points: [
      "Custom domain support",
      "Brand colors and typography",
      "White-label experience",
      "Mobile-ready PWA",
    ],
    illustration: <BrandingIllustration />,
  },
  {
    title: "Autopilot revenue",
    icon: Zap,
    description:
      "Automate the repetitive tasks and earn steadily. From email sequences to subscription billing, let the system work for you.",
    points: [
      "Automated email sequences",
      "Recurring subscription billing",
      "Payment processing via Stripe",
      "Student progress automation",
    ],
    illustration: <AutomationIllustration />,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Built for creators who mean business
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From course creation to payments, live teaching to automation —
            everything under your brand.
          </p>
        </div>

        {/* Features */}
        <div className="mt-20">
          {features.map((feature, index) => (
            <div key={feature.title}>
              <div
                className={`grid items-center gap-16 py-20 md:grid-cols-2 ${
                  index % 2 !== 0 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                {/* Text side */}
                <div>
                  <feature.icon className="h-8 w-8 text-primary" />
                  <h3 className="font-display mt-4 text-2xl font-bold">{feature.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {feature.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {feature.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Illustration side */}
                <div className="rounded-xl border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1">
                  {feature.illustration}
                </div>
              </div>
              {index < features.length - 1 && <div className="h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
