"use client";

import {
  CheckoutAside,
  PlanCheckoutAside,
  type CheckoutStep,
  type PlanTerms,
} from "@shared/checkout/embedded-checkout";
import { imageUrl } from "@/components/sections/kit";
import { LogoMarkSvg } from "@/components/shared/logo-mark";
import { useTenant } from "@/hooks/use-tenant";
import { useTranslations } from "next-intl";

/** The home hero's first photo: the coach's own picture of her teaching. */
function useSitePhoto(): string | null {
  const config = useTenant();
  const hero = config?.pages?.home?.blocks?.find(
    (b) => b.enabled !== false && b.type.includes("hero"),
  );
  return imageUrl(hero?.image);
}

/** A coach paying for her own plan: Contentor's panel over her own photo
 *  (a creator's while her site has none). */
export function CoachPlanAside({
  title,
  plan,
}: {
  title: string;
  plan: PlanTerms;
}) {
  const photo = useSitePhoto() ?? undefined;
  return <PlanCheckoutAside photo={photo} title={title} plan={plan} />;
}

/** A student buying from the coach: her colours, her logo, and the photo of
 *  what is bought (her own hero photo when it has none). */
export function StudentCheckoutAside({
  title,
  photo,
  steps,
}: {
  title: string;
  photo?: string | null;
  steps: CheckoutStep[];
}) {
  const t = useTranslations("site");
  const config = useTenant();
  const sitePhoto = useSitePhoto();
  const name = config?.brand_name || t("checkout.title");
  return (
    <CheckoutAside
      photo={photo || sitePhoto}
      tint="var(--primary)"
      ink="var(--primary-foreground)"
      mark={
        <span className="flex items-center gap-2 font-display font-semibold">
          {config?.logo_mark ? (
            <LogoMarkSvg
              mark={config.logo_mark}
              label={name}
              className="h-6 w-auto text-primary"
            />
          ) : config?.logo_url ? (
            <img src={config.logo_url} alt={name} className="h-6 w-auto" />
          ) : null}
          {/* A saved logo image carries the wordmark; a mark does not. */}
          {!config?.logo_url || config.logo_mark ? name : null}
        </span>
      }
      title={title}
      steps={steps}
    />
  );
}
