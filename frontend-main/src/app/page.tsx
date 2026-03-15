import Link from 'next/link'
import { BookOpen, Video, Download, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

const features = [
  {
    title: 'Courses',
    description: 'Create and sell structured courses with videos, quizzes, and assignments.',
    icon: BookOpen,
  },
  {
    title: 'Live Classes',
    description: 'Host real-time classes with built-in video conferencing and chat.',
    icon: Video,
  },
  {
    title: 'Downloads',
    description: 'Sell digital downloads like PDFs, templates, and resource packs.',
    icon: Download,
  },
  {
    title: 'Custom Branding',
    description: 'Your own logo, colors, and domain for a fully branded experience.',
    icon: Palette,
  },
]

const steps = [
  { step: '1', title: 'Sign Up', description: 'Create your free account in seconds.' },
  { step: '2', title: 'Customize', description: 'Set up your brand, courses, and pricing.' },
  { step: '3', title: 'Launch', description: 'Share your link and start earning.' },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
          Monetize Your Content
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Launch your own branded platform for courses, live classes, downloads, and more. No coding required.
        </p>
        <div className="mt-8 flex gap-4">
          <Button asChild size="lg">
            <Link href="/signup">Start Free Trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Everything you need to succeed</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="mb-2 h-8 w-8 text-primary" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold">How it works</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary px-4 py-20 text-center text-primary-foreground">
        <h2 className="text-3xl font-bold">Ready to get started?</h2>
        <p className="mt-4 text-lg opacity-90">Join thousands of creators monetizing their content with Contentor.</p>
        <Button asChild size="lg" variant="secondary" className="mt-8">
          <Link href="/signup">Start Free Trial</Link>
        </Button>
      </section>

      <PlatformFooter />
    </div>
  )
}
