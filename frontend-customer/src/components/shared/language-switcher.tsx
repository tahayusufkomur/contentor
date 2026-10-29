"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

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

/** The creator's own language. The backend writes it to every row it lives on and sets the
 *  `user-locale` cookie, so the studio re-renders in it on the refresh. */
export function LanguageSwitcher() {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const locale = useLocale();

  const { run: change, loading } = useAsyncAction(async (next: string) => {
    await clientFetch("/api/v1/auth/users/me/locale/", {
      method: "POST",
      body: JSON.stringify({ locale: next }),
    });
    router.refresh();
  });

  return (
    <div className="space-y-2">
      <Label htmlFor="your-language">{t("yourLanguage")}</Label>
      <Select value={locale} onValueChange={change} disabled={loading}>
        <SelectTrigger id="your-language">
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
      <p className="text-xs text-muted-foreground">{t("yourLanguageHint")}</p>
    </div>
  );
}
