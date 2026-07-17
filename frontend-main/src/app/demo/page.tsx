import Link from "next/link";
import {
  ArrowRight,
  GraduationCap,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";

import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { BASE_DOMAIN } from "@/lib/constants";
import { DEMO_NICHES, demoEntryUrl } from "@/lib/demos";

export const metadata = {
  title: "Try Contentor — Live Demos",
  description:
    "Explore Contentor through real, read-only demo tenants for seven niches. View as a student or as a coach.",
};

export default async function DemoGalleryPage() {
  const user = await getAuthUser();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 sm:py-24">
        <header className="mb-12 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Live, read-only demos
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            See Contentor in action
          </h1>
          <p className="text-lg text-muted-foreground">
            Each demo is a fully wired tenant with real courses, schedules, and
            admin tools. Click in as a student to see what your customers
            experience — or as a coach to explore the dashboard you&apos;ll work
            in.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {DEMO_NICHES.map((demo) => (
            <article
              key={demo.niche}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg"
            >
              <div
                className={`h-32 bg-gradient-to-br ${demo.accent}`}
                aria-hidden="true"
              />
              <div className="flex flex-1 flex-col gap-4 p-6">
                <div>
                  <h2 className="text-xl font-semibold">{demo.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {demo.tagline}
                  </p>
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <a
                    href={demoEntryUrl(demo, "student", BASE_DOMAIN)}
                    className="inline-flex items-center justify-between rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <span className="inline-flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      View as student
                    </span>
                    <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                  <a
                    href={demoEntryUrl(demo, "coach", BASE_DOMAIN)}
                    className="inline-flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <span className="inline-flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      View as coach
                    </span>
                    <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                  <Link
                    href={`/signup?template=${encodeURIComponent(demo.niche)}`}
                    className="mt-1 inline-flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Start with this template →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="mb-3 text-2xl font-bold">Found one you like?</h2>
          <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
            Spin up your own copy in 30 seconds — keep the design, drop the demo
            content, and start adding your courses.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Start your own
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
