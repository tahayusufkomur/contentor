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

      <ScrollReveal direction="up" delay={0.1}>
        <ProductMockup />
      </ScrollReveal>

      <ScrollReveal direction="fade">
        <SocialProofBar />
      </ScrollReveal>

      <ScrollReveal direction="up">
        <FeaturesSection />
      </ScrollReveal>

      <ScrollReveal direction="up" delay={0.1}>
        <TestimonialsSection />
      </ScrollReveal>

      <ScrollReveal direction="fade">
        <StatsSection />
      </ScrollReveal>

      <ScrollReveal direction="up">
        <HowItWorksSection />
      </ScrollReveal>

      <ScrollReveal direction="up" delay={0.05}>
        <FaqSection />
      </ScrollReveal>

      <FinalCtaSection />

      <PlatformFooter />
    </div>
  )
}
