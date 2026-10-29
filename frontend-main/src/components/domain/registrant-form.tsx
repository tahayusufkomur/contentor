"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegistrantContact } from "@/lib/domains";

// Country code (ISO 3166 alpha-2) + international dialing code. The names come from Intl, in the
// page's language, and the list is sorted by them.
const COUNTRIES: { code: string; dial: string }[] = [
  { code: "AR", dial: "+54" },
  { code: "AU", dial: "+61" },
  { code: "AT", dial: "+43" },
  { code: "BE", dial: "+32" },
  { code: "BR", dial: "+55" },
  { code: "CA", dial: "+1" },
  { code: "CL", dial: "+56" },
  { code: "CN", dial: "+86" },
  { code: "CO", dial: "+57" },
  { code: "CZ", dial: "+420" },
  { code: "DK", dial: "+45" },
  { code: "EG", dial: "+20" },
  { code: "FI", dial: "+358" },
  { code: "FR", dial: "+33" },
  { code: "DE", dial: "+49" },
  { code: "GR", dial: "+30" },
  { code: "HK", dial: "+852" },
  { code: "HU", dial: "+36" },
  { code: "IN", dial: "+91" },
  { code: "ID", dial: "+62" },
  { code: "IE", dial: "+353" },
  { code: "IL", dial: "+972" },
  { code: "IT", dial: "+39" },
  { code: "JP", dial: "+81" },
  { code: "KE", dial: "+254" },
  { code: "MY", dial: "+60" },
  { code: "MX", dial: "+52" },
  { code: "MA", dial: "+212" },
  { code: "NL", dial: "+31" },
  { code: "NZ", dial: "+64" },
  { code: "NG", dial: "+234" },
  { code: "NO", dial: "+47" },
  { code: "PK", dial: "+92" },
  { code: "PH", dial: "+63" },
  { code: "PL", dial: "+48" },
  { code: "PT", dial: "+351" },
  { code: "QA", dial: "+974" },
  { code: "RO", dial: "+40" },
  { code: "SA", dial: "+966" },
  { code: "SG", dial: "+65" },
  { code: "ZA", dial: "+27" },
  { code: "KR", dial: "+82" },
  { code: "ES", dial: "+34" },
  { code: "SE", dial: "+46" },
  { code: "CH", dial: "+41" },
  { code: "TH", dial: "+66" },
  { code: "TR", dial: "+90" },
  { code: "UA", dial: "+380" },
  { code: "AE", dial: "+971" },
  { code: "GB", dial: "+44" },
  { code: "US", dial: "+1" },
  { code: "VN", dial: "+84" },
];

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none " +
  "focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]";

function dialFor(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.dial ?? "+1";
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: full.trim(), last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function RegistrantForm({
  defaultEmail,
  defaultName,
  onSubmit,
  onBack,
  submitLabel,
}: {
  defaultEmail: string;
  defaultName: string;
  onSubmit: (c: RegistrantContact) => void;
  onBack: () => void;
  submitLabel: string;
}) {
  const t = useTranslations("domain.registrant");
  const locale = useLocale();
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return COUNTRIES.map((c) => ({
      ...c,
      name: names.of(c.code) ?? c.code,
    })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const seed = splitName(defaultName || "");
  const [firstName, setFirstName] = useState(seed.first);
  const [lastName, setLastName] = useState(seed.last);
  const [organization, setOrganization] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [dialCode, setDialCode] = useState(dialFor("US"));
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(defaultEmail || "");
  const [error, setError] = useState<string | null>(null);

  // Keep the phone dialing code in step with the chosen country.
  const onCountryChange = (code: string) => {
    setCountry(code);
    setDialCode(dialFor(code));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneDigits = phone.replace(/\D/g, "");
    if (!firstName || !lastName || !address1 || !city || !zip || !email) {
      setError(t("fillRequired"));
      return;
    }
    if (phoneDigits.length < 4) {
      setError(t("invalidPhone"));
      return;
    }
    onSubmit({
      FirstName: firstName,
      LastName: lastName,
      ContactType: organization ? "COMPANY" : "PERSON",
      OrganizationName: organization,
      AddressLine1: address1,
      City: city,
      State: stateRegion,
      CountryCode: country,
      ZipCode: zip,
      // Route 53 wants +<country code>.<number> — assembled from the friendly inputs.
      PhoneNumber: `${dialCode}.${phoneDigits}`,
      Email: email,
    });
  };

  const field = "space-y-1.5";
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("intro")}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="fn">{t("firstName")} *</Label>
          <Input
            id="fn"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="ln">{t("lastName")} *</Label>
          <Input
            id="ln"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>

      <div className={field}>
        <Label htmlFor="org">{t("company")}</Label>
        <Input
          id="org"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
      </div>

      <div className={field}>
        <Label htmlFor="addr">{t("address")} *</Label>
        <Input
          id="addr"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="city">{t("city")} *</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="state">{t("state")}</Label>
          <Input
            id="state"
            value={stateRegion}
            onChange={(e) => setStateRegion(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="zip">{t("zip")} *</Label>
          <Input
            id="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="country">{t("country")} *</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            className={SELECT_CLASS}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={field}>
        <Label htmlFor="phone">{t("phone")} *</Label>
        <div className="flex gap-2">
          <select
            aria-label={t("dialingCode")}
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className={`${SELECT_CLASS} w-28 shrink-0`}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.dial}>
                {c.dial} ({c.code})
              </option>
            ))}
          </select>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      <div className={field}>
        <Label htmlFor="email">{t("email")} *</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t("back")}
        </Button>
        <Button type="submit" variant="brand">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
