import {
  BellRing,
  CreditCard,
  Megaphone,
  MessageCircle,
  Palette,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { TeamRole } from "@/lib/landing";

/** One icon per team role, the same in the hero's hub and the team tabs. */
export const ROLE_ICONS: Record<TeamRole, LucideIcon> = {
  designer: Palette,
  marketer: Megaphone,
  producer: Video,
  community: BellRing,
  assistant: MessageCircle,
  cashier: CreditCard,
};
