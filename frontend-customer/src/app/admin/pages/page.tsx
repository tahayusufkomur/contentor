import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { PAGE_KEYS, PAGE_LABELS, PAGE_ROUTES } from "@/lib/blocks/pages";

export const dynamic = "force-dynamic";

export default function PagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pages</h1>
        <p className="text-sm text-muted-foreground">
          Design every page of your site with the live editor. Open a page and use the
          left panel to add, reorder, and edit content blocks — changes save automatically.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1 space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick a page to start editing. You&apos;ll see your real site with the builder panel.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAGE_KEYS.map((key) => (
                <Button key={key} asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={PAGE_ROUTES[key]}>
                    {PAGE_LABELS[key]}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
