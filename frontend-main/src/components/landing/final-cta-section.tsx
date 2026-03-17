import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextureOverlay } from "@/components/ui/texture-overlay";

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-primary px-6 py-32 md:py-40">
      <TextureOverlay opacity={0.05} />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl">
          Your audience is waiting
        </h2>
        <p className="mt-4 text-primary-foreground/80">
          Join 500+ creators already earning on Contentor. Start free — upgrade
          when you&apos;re ready.
        </p>

        <Button
          asChild
          className="mt-8 h-12 gap-2 border-0 bg-background px-8 text-base font-semibold text-foreground shadow-lg hover:bg-background/90"
        >
          <Link href="/signup">
            Start Free Today
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        <p className="mt-3 text-sm text-primary-foreground/60">
          Free forever plan. No credit card required.
        </p>
      </div>
    </section>
  );
}
