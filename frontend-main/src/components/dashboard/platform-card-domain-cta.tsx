import Link from "next/link";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlatformCardDomainCta({ slug }: { slug: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/dashboard/domain/${slug}`}>
        <Globe2 className="h-3.5 w-3.5" /> Custom domain
      </Link>
    </Button>
  );
}
