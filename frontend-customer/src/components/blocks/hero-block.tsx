import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function HeroBlock({ data }: BlockComponentProps) {
  const bg = data.bgImage?.url as string | undefined;
  return (
    <section
      className="relative flex min-h-[60vh] flex-col items-center justify-center py-20 text-center"
      style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {bg && <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />}
      <div className="relative z-10 mx-auto max-w-3xl px-4">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {data.heading}
        </h1>
        {data.subheading && (
          <p className="mt-5 text-lg text-muted-foreground md:text-xl">{data.subheading}</p>
        )}
        {data.ctaText && data.ctaHref && (
          <Button asChild size="lg" className="mt-8 gap-2">
            <Link href={data.ctaHref}>
              {data.ctaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
