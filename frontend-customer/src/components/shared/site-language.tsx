"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { clientFetch } from "@/lib/api-client";
import { enabledLocales, nativeName } from "@shared/i18n/locales";
import { useAsyncAction } from "@shared/hooks/use-async-action";

interface SiteLanguageState {
  language: string;
  locked: boolean;
}

const ENDPOINT = "/api/v1/admin/config/site-language/";

/** The language of the site students see. The owner can change it until the site has gone live. */
export function SiteLanguage() {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const [state, setState] = useState<SiteLanguageState | null>(null);

  useEffect(() => {
    clientFetch<SiteLanguageState>(ENDPOINT)
      .then(setState)
      .catch(() => setState(null));
  }, []);

  const { run: change, loading } = useAsyncAction(async (language: string) => {
    setState(
      await clientFetch<SiteLanguageState>(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ language }),
      }),
    );
    router.refresh();
  });

  if (!state) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="site-language">{t("siteLanguage")}</Label>
      <Select
        value={state.language}
        onValueChange={change}
        disabled={loading || state.locked}
      >
        <SelectTrigger id="site-language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {enabledLocales().map((code) => (
            <SelectItem key={code} value={code}>
              {nativeName(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {state.locked ? t("siteLanguageLocked") : t("siteLanguageHint")}
      </p>
    </div>
  );
}
