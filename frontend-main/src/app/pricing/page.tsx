import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with the basics. Perfect for testing the waters.',
    features: [
      { text: 'Up to 50 students', included: true },
      { text: '1 GB storage', included: true },
      { text: 'Basic course builder', included: true },
      { text: 'Community support', included: true },
      { text: '10% transaction fee', included: true },
      { text: 'Live classes', included: false },
      { text: 'Custom branding', included: false },
      { text: 'Custom domain', included: false },
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For growing creators ready to scale their business.',
    features: [
      { text: 'Up to 500 students', included: true },
      { text: '10 GB storage', included: true },
      { text: 'Advanced course builder', included: true },
      { text: 'Live classes', included: true },
      { text: 'Custom branding', included: true },
      { text: 'Email campaigns (1,000/mo)', included: true },
      { text: '5% transaction fee', included: true },
      { text: 'Custom domain', included: false },
    ],
    cta: 'Get Started',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For established businesses that need everything.',
    features: [
      { text: 'Unlimited students', included: true },
      { text: '100 GB storage', included: true },
      { text: 'Advanced course builder', included: true },
      { text: 'Live classes & streaming', included: true },
      { text: 'Custom domain', included: true },
      { text: 'Email campaigns (10,000/mo)', included: true },
      { text: '2% transaction fee', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Get Started',
    highlighted: false,
  },
]

const faqs = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade your plan at any time. Changes take effect immediately and billing is prorated.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Every plan comes with a 14-day free trial. No credit card required to get started.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards, debit cards, and PayPal. Enterprise customers can also pay by invoice.',
  },
  {
    question: 'What happens if I exceed my plan limits?',
    answer:
      'We will notify you when you approach your limits. You can upgrade at any time to get more capacity without losing any data.',
  },
]

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader />

      {/* Hero */}
      <section className="px-6 pb-16 pt-32 md:pt-40">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free and scale as you grow. No hidden fees.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.highlighted
                  ? 'relative ring-2 ring-foreground'
                  : 'border'
              }
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Popular</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">
                  {plan.name}
                </CardTitle>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <Separator className="mb-6" />
                <ul className="flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.text}
                      className="flex items-start gap-3 text-sm"
                    >
                      {feature.included ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          feature.included
                            ? 'text-foreground'
                            : 'text-muted-foreground/60'
                        }
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-8 w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t px-6 py-32 md:py-40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-16 space-y-12">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-base font-semibold text-foreground">
                  {faq.question}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-32 md:py-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join creators who are already monetizing their content with Contentor.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 gap-2 px-8 text-base">
            <Link href="/signup">Get Started</Link>
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
