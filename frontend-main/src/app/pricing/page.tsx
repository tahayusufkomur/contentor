import Link from 'next/link'
import { Check, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with the basics.',
    features: [
      'Up to 50 students',
      '1 GB storage',
      'Basic course builder',
      'Community support',
      '10% transaction fee',
    ],
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For growing creators.',
    features: [
      'Up to 500 students',
      '10 GB storage',
      'Live classes',
      'Custom branding',
      'Email campaigns (1,000/mo)',
      '5% transaction fee',
    ],
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For established businesses.',
    features: [
      'Unlimited students',
      '100 GB storage',
      'Live classes & streaming',
      'Custom domain',
      'Email campaigns (10,000/mo)',
      '2% transaction fee',
      'Priority support',
    ],
  },
]

const faqs = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately and billing is prorated.',
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
      <section className="px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free and scale as you grow. No hidden fees.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="px-4 pb-20 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.highlighted
                  ? 'relative border-2 border-primary shadow-lg'
                  : 'border'
              }
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <Separator className="mb-6" />
                <ul className="flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-8 w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  <Link href="/signup">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/30 px-4 py-20 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 flex items-center justify-center gap-3 text-center">
            <HelpCircle className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Frequently asked questions</h2>
          </div>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <Card key={faq.question} className="border bg-card">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-foreground">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
