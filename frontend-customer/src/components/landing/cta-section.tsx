import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { LandingCta } from "@/types/tenant";

export function CtaSection({ data }: { data: LandingCta }) {
  if (!data.enabled) return null;
  return (
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          {data.heading}
        </h2>
        {data.button_text && data.button_href && (
          <Button asChild size="lg" className="mt-8 gap-2">
            <Link href={data.button_href}>
              {data.button_text}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
