import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function BannerBlock({ data }: BlockComponentProps) {
  if (!data.text) return null;
  return (
    <section className="px-4 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl bg-primary px-6 py-4 text-center text-primary-foreground">
        <span className="text-sm font-medium">{data.text}</span>
        {data.linkText && data.linkHref && (
          <Link href={data.linkHref} className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">
            {data.linkText}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
