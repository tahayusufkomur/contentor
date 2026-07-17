"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegistrantContact } from "@/lib/domains";

// Country code (ISO 3166 alpha-2) + international dialing code, sorted by name.
const COUNTRIES: { code: string; name: string; dial: string }[] = [
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "AT", name: "Austria", dial: "+43" },
  { code: "BE", name: "Belgium", dial: "+32" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "CZ", name: "Czechia", dial: "+420" },
  { code: "DK", name: "Denmark", dial: "+45" },
  { code: "EG", name: "Egypt", dial: "+20" },
  { code: "FI", name: "Finland", dial: "+358" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "GR", name: "Greece", dial: "+30" },
  { code: "HK", name: "Hong Kong", dial: "+852" },
  { code: "HU", name: "Hungary", dial: "+36" },
  { code: "IN", name: "India", dial: "+91" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "KE", name: "Kenya", dial: "+254" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "MA", name: "Morocco", dial: "+212" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "NO", name: "Norway", dial: "+47" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "PL", name: "Poland", dial: "+48" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "RO", name: "Romania", dial: "+40" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "TR", name: "Türkiye", dial: "+90" },
  { code: "UA", name: "Ukraine", dial: "+380" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "VN", name: "Vietnam", dial: "+84" },
];

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none " +
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

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
      setError("Please fill in all required fields.");
      return;
    }
    if (phoneDigits.length < 4) {
      setError("Please enter a valid phone number.");
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
      <p className="text-xs text-muted-foreground">
        Domain registrars require the owner&apos;s contact details to register a
        domain. We only use them for the registration.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="fn">First name *</Label>
          <Input
            id="fn"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="ln">Last name *</Label>
          <Input
            id="ln"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>

      <div className={field}>
        <Label htmlFor="org">Company (optional)</Label>
        <Input
          id="org"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
      </div>

      <div className={field}>
        <Label htmlFor="addr">Street address *</Label>
        <Input
          id="addr"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="state">State / region</Label>
          <Input
            id="state"
            value={stateRegion}
            onChange={(e) => setStateRegion(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="zip">Postal code *</Label>
          <Input
            id="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </div>
        <div className={field}>
          <Label htmlFor="country">Country *</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            className={SELECT_CLASS}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={field}>
        <Label htmlFor="phone">Phone number *</Label>
        <div className="flex gap-2">
          <select
            aria-label="Country dialing code"
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className={`${SELECT_CLASS} w-28 shrink-0`}
          >
            {COUNTRIES.map((c) => (
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
        <Label htmlFor="email">Email *</Label>
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
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button type="submit" variant="brand">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
