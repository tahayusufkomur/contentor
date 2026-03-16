import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Check,
  Globe,
  Play,
  Video,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

const features = [
  {
    title: 'Structured courses',
    description:
      'Build comprehensive learning experiences with modules, lessons, and video content. Track student progress automatically.',
    points: [
      'Video lessons with progress tracking',
      'Modular course structure',
      'Student enrollment management',
      'Free preview lessons',
    ],
    icon: BookOpen,
  },
  {
    title: 'Live classes',
    description:
      'Host real-time sessions with built-in video, chat, and recording. Schedule classes and manage attendance effortlessly.',
    points: [
      'WebRTC video conferencing',
      'Live chat during sessions',
      'Automatic recording to cloud',
      'Scheduling and reminders',
    ],
    icon: Video,
  },
  {
    title: 'Your brand, your domain',
    description:
      'Every creator gets a fully branded platform. Custom colors, fonts, logo, and your own domain name.',
    points: [
      'Custom domain support',
      'Brand colors and typography',
      'White-label experience',
      'Mobile-ready PWA',
    ],
    icon: Globe,
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-dot-pattern absolute inset-0 opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pb-20 pt-32 text-center md:pb-32 md:pt-40 lg:pt-48">
          <Badge variant="outline" className="mb-8 gap-1.5 px-4 py-1.5 text-sm font-normal">
            <Zap className="h-3.5 w-3.5" />
            Now in Beta
          </Badge>
          <h1 className="text-5xl font-bold tracking-tighter text-foreground md:text-6xl lg:text-7xl">
            The platform for
            <br />
            content creators
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Launch your own branded platform for courses, live classes, and digital content. Start earning in minutes.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 gap-2 px-8 text-base">
              <Link href="/signup">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-12 gap-2 px-8 text-base">
              <Link href="#features">
                <Play className="h-4 w-4" />
                See how it works
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground/60">
            No credit card required
          </p>
        </div>
      </section>

      {/* Product mockup */}
      <section className="px-6 pb-32">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
                <div className="h-3 w-3 rounded-full bg-border" />
              </div>
              <div className="mx-auto flex h-7 w-64 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
                your-brand.contentor.app
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="p-6 md:p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="h-4 w-24 rounded bg-foreground/10" />
                  <div className="mt-2 h-3 w-40 rounded bg-foreground/5" />
                </div>
                <div className="h-9 w-28 rounded-lg bg-foreground text-center text-sm leading-9 text-background">
                  New Course
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                {['142 Students', '$2.4k Revenue', '8 Courses', '96% Completion'].map(
                  (stat) => (
                    <div
                      key={stat}
                      className="rounded-lg border bg-background p-4"
                    >
                      <div className="text-2xl font-bold tracking-tight">
                        {stat.split(' ')[0]}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {stat.split(' ').slice(1).join(' ')}
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-6 space-y-3">
                {['Introduction to Yoga', 'Advanced Meditation', 'Breathwork Basics'].map(
                  (course, i) => (
                    <div
                      key={course}
                      className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-foreground/5" />
                        <div>
                          <div className="text-sm font-medium">{course}</div>
                          <div className="text-xs text-muted-foreground">
                            {12 - i * 3} lessons
                          </div>
                        </div>
                      </div>
                      <Badge variant={i === 0 ? 'default' : 'secondary'}>
                        {i === 0 ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Trusted by creators worldwide
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {['Yoga Studio', 'Dance Academy', 'Fitness Pro', 'Music School', 'Art Workshop'].map(
              (name) => (
                <span
                  key={name}
                  className="text-lg font-semibold tracking-tight text-muted-foreground/40"
                >
                  {name}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-32 md:py-40">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              One platform to create, sell, and grow your content business.
            </p>
          </div>

          <div className="mt-24 space-y-0">
            {features.map((feature, index) => (
              <div key={feature.title}>
                {index > 0 && <Separator className="my-0" />}
                <div
                  className={`grid items-center gap-12 py-20 md:grid-cols-2 md:gap-16 ${
                    index % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div>
                    <feature.icon className="mb-4 h-8 w-8 text-foreground" />
                    <h3 className="text-2xl font-bold tracking-tight md:text-3xl">
                      {feature.title}
                    </h3>
                    <p className="mt-4 text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                    <ul className="mt-6 space-y-3">
                      {feature.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-center gap-3 text-sm"
                        >
                          <Check className="h-4 w-4 shrink-0 text-foreground" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Feature illustration placeholder */}
                  <div className="aspect-[4/3] rounded-xl border bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats — inverted section */}
      <section className="bg-foreground px-6 py-24 text-background md:py-32">
        <div className="mx-auto grid max-w-4xl gap-8 text-center md:grid-cols-3">
          {[
            { value: '500+', label: 'Creators' },
            { value: '50,000+', label: 'Students' },
            { value: '$1M+', label: 'Revenue generated' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-bold tracking-tighter md:text-5xl" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-background/60">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-32 md:py-40">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Up and running in minutes
          </h2>
          <div className="relative mt-20 grid gap-8 md:grid-cols-3">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-8 hidden h-px bg-border md:block" />
            {[
              { n: '1', title: 'Sign up', desc: 'Create your free account.' },
              {
                n: '2',
                title: 'Customize',
                desc: 'Add your brand, courses, and pricing.',
              },
              {
                n: '3',
                title: 'Launch',
                desc: 'Share your link and start earning.',
              },
            ].map((step) => (
              <div key={step.n} className="relative text-center">
                <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground bg-background text-xl font-bold">
                  {step.n}
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t px-6 py-32 md:py-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Start building today
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join creators who are already monetizing their content.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 gap-2 px-8 text-base">
            <Link href="/signup">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <p className="mt-3 text-sm text-muted-foreground/60">
            Free plan available. No credit card required.
          </p>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
