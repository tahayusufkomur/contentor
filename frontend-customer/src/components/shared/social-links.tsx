"use client";

import {
  Facebook,
  Instagram,
  Linkedin,
  Link2,
  Music2,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  twitter: Twitter,
  linkedin: Linkedin,
  tiktok: Music2,
};

/** The coach's social accounts as icons for the navbar. Shown when the coach
 * turned them on there (navbar_config.show_social) and has at least one. */
export function SocialLinks({ className }: { className?: string }) {
  const config = useTenant();
  const links = Object.entries(config?.social_links ?? {}).filter(
    ([, url]) => url,
  );
  if (!config?.navbar_config?.show_social || links.length === 0) return null;
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {links.map(([name, url]) => {
        const Icon = ICONS[name.toLowerCase()] ?? Link2;
        return (
          <li key={name}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={name}
              title={name}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
