import { fetchTenantConfig, getTenantSlug } from '@/lib/tenant'
import { serverFetch } from '@/lib/api-server'
import { HeroSection } from '@/components/landing/hero-section'
import { AboutSection } from '@/components/landing/about-section'
import { CoursesSection } from '@/components/landing/courses-section'
import { TestimonialsSection } from '@/components/landing/testimonials-section'
import { FaqSection } from '@/components/landing/faq-section'
import { CtaSection } from '@/components/landing/cta-section'
import type { Course } from '@/types/course'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const slug = await getTenantSlug()
  const config = await fetchTenantConfig(slug)
  const sections = config?.landing_sections ?? {}

  let courses: Course[] = []
  if (sections.courses?.enabled) {
    try {
      courses = await serverFetch<Course[]>('/api/v1/courses/')
    } catch {
      courses = []
    }
  }

  // Break out of the layout's px-4/py-8 container so sections are full-width
  return (
    <div className="-mx-4 -mt-8 md:-mx-6">
      {sections.hero && <HeroSection data={sections.hero} />}
      {sections.about && <AboutSection data={sections.about} />}
      {sections.courses && <CoursesSection data={sections.courses} courses={courses} />}
      {sections.testimonials && <TestimonialsSection data={sections.testimonials} />}
      {sections.faq && <FaqSection data={sections.faq} />}
      {sections.cta && <CtaSection data={sections.cta} />}
    </div>
  )
}
