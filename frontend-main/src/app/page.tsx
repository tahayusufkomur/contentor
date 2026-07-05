import { HeroSection } from '@/components/landing/hero-section'
import { ProductMockup } from '@/components/landing/product-mockup'
import { SocialProofBar } from '@/components/landing/social-proof-bar'
import { FeaturesSection } from '@/components/landing/features-section'
import { FoundingCreatorsSection } from '@/components/landing/founding-creators-section'
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

      {/* Clean house style: a single, restrained reveal motion throughout */}
      <ScrollReveal direction="up" duration={0.7}>
        <ProductMockup />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <SocialProofBar />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <FeaturesSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <StatsSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <HowItWorksSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <FoundingCreatorsSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <FaqSection />
      </ScrollReveal>

      <ScrollReveal direction="up" duration={0.7}>
        <FinalCtaSection />
      </ScrollReveal>

      <PlatformFooter />
    </div>
  )
}
