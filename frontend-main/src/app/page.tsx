import Link from 'next/link'
import { BookOpen, Video, Download, Palette, ArrowRight, Users, GraduationCap, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

const features = [
  {
    title: 'Courses',
    description: 'Create and sell structured courses with videos, quizzes, and assignments.',
    icon: BookOpen,
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Live Classes',
    description: 'Host real-time classes with built-in video conferencing and chat.',
    icon: Video,
    color: 'bg-chart-2/10 text-chart-2',
  },
  {
    title: 'Downloads',
    description: 'Sell digital downloads like PDFs, templates, and resource packs.',
    icon: Download,
    color: 'bg-chart-4/10 text-chart-4',
  },
  {
    title: 'Custom Branding',
    description: 'Your own logo, colors, and domain for a fully branded experience.',
    icon: Palette,
    color: 'bg-chart-5/10 text-chart-5',
  },
]

const steps = [
  { step: '1', title: 'Sign Up', description: 'Create your free account in seconds.' },
  { step: '2', title: 'Customize', description: 'Set up your brand, courses, and pricing.' },
  { step: '3', title: 'Launch', description: 'Share your link and start earning.' },
]

const stats = [
  { value: '500+', label: 'Creators', icon: Users },
  { value: '50K+', label: 'Students', icon: GraduationCap },
  { value: '$1M+', label: 'Revenue Generated', icon: DollarSign },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-background" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center md:px-6 md:py-32 lg:py-40">
          <div className="inline-flex items-center rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
            Now in Beta — Start building for free
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Monetize Your Content
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Launch your own branded platform for courses, live classes, downloads, and more. No coding required.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">See Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/30 px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Everything you need to succeed
            </h2>
            <p className="mt-4 text-muted-foreground">
              All the tools you need to create, sell, and grow your content business — in one platform.
            </p>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="border bg-card transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.color}`}>
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-muted-foreground">Get started in three simple steps.</p>
          </div>
          <div className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
            {/* Connecting line (desktop only) */}
            <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-border md:block" />
            {steps.map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="relative mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background text-lg font-bold text-primary">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t bg-muted/30 px-4 py-20 md:px-6">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Trusted by creators worldwide
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center text-center">
                <stat.icon className="mb-3 h-8 w-8 text-primary" />
                <p className="text-4xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 md:px-6">
        <Card className="mx-auto max-w-4xl border-0 bg-primary text-primary-foreground">
          <CardContent className="flex flex-col items-center p-8 text-center md:p-12">
            <h2 className="text-3xl font-bold md:text-4xl">Ready to get started?</h2>
            <p className="mt-4 max-w-lg text-lg opacity-90">
              Join thousands of creators monetizing their content with Contentor.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-8 gap-2">
              <Link href="/signup">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <PlatformFooter />
    </div>
  )
}
