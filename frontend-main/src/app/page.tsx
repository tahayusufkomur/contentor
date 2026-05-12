import { HeroSection } from '@/components/landing/hero-section'
import { ProductMockup } from '@/components/landing/product-mockup'
import { SocialProofBar } from '@/components/landing/social-proof-bar'
import { FeaturesSection } from '@/components/landing/features-section'
import { TestimonialsSection } from '@/components/landing/testimonials-section'
import { StatsSection } from '@/components/landing/stats-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FaqSection } from '@/components/landing/faq-section'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { PlatformHeader } from '@/components/shared/platform-header'
import { PlatformFooter } from '@/components/shared/platform-footer'
import { getAuthUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getAuthUser()
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <HeroSection />

      {/* Device mockup: cinematic scale-in like Apple iPhone reveals */}
      <ScrollReveal variant="scale" fromScale={0.9} duration={1.2}>
        <ProductMockup />
      </ScrollReveal>

      <ScrollReveal variant="blur" duration={1}>
        <SocialProofBar />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={1}>
        <FeaturesSection />
      </ScrollReveal>

      <ScrollReveal variant="scale" fromScale={0.96} duration={1.1}>
        <StatsSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={1}>
        <HowItWorksSection />
      </ScrollReveal>

      <ScrollReveal variant="blur" duration={1}>
        <TestimonialsSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={1}>
        <FaqSection />
      </ScrollReveal>

      <ScrollReveal variant="zoom" duration={1.2}>
        <FinalCtaSection />
      </ScrollReveal>

      <PlatformFooter />
    </div>
  )
}
