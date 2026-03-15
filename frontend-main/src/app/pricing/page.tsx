import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-4 text-center text-4xl font-bold">Simple, transparent pricing</h1>
          <p className="mb-12 text-center text-lg text-muted-foreground">
            Start free and scale as you grow. No hidden fees.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? 'border-primary shadow-lg relative' : ''}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6 w-full" variant={plan.highlighted ? 'default' : 'outline'}>
                    <Link href="/signup">Start Free Trial</Link>
                  </Button>
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
