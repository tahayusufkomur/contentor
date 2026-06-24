'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RegistrantContact } from '@/lib/domains'

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' }, { code: 'TR', name: 'Türkiye' },
  { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' }, { code: 'IE', name: 'Ireland' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'CH', name: 'Switzerland' }, { code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' }, { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'JP', name: 'Japan' },
]

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return { first: full.trim(), last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function RegistrantForm({
  defaultEmail,
  defaultName,
  onSubmit,
  onBack,
  submitLabel,
}: {
  defaultEmail: string
  defaultName: string
  onSubmit: (c: RegistrantContact) => void
  onBack: () => void
  submitLabel: string
}) {
  const seed = splitName(defaultName || '')
  const [firstName, setFirstName] = useState(seed.first)
  const [lastName, setLastName] = useState(seed.last)
  const [organization, setOrganization] = useState('')
  const [address1, setAddress1] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(defaultEmail || '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!firstName || !lastName || !address1 || !city || !zip || !email) {
      setError('Please fill in all required fields.')
      return
    }
    // Phone must be +CC.NUMBER for Route 53.
    const phoneClean = phone.replace(/[^\d+.]/g, '')
    if (!/^\+\d{1,3}\.\d{4,}$/.test(phoneClean)) {
      setError('Phone must look like +1.5551234567 (country code, dot, number).')
      return
    }
    onSubmit({
      FirstName: firstName,
      LastName: lastName,
      ContactType: organization ? 'COMPANY' : 'PERSON',
      OrganizationName: organization,
      AddressLine1: address1,
      City: city,
      State: stateRegion,
      CountryCode: country,
      ZipCode: zip,
      PhoneNumber: phoneClean,
      Email: email,
    })
  }

  const field = 'space-y-1.5'
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="fn">First name *</Label><Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
        <div className={field}><Label htmlFor="ln">Last name *</Label><Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
      </div>
      <div className={field}><Label htmlFor="org">Organization (optional)</Label><Input id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} /></div>
      <div className={field}><Label htmlFor="addr">Address *</Label><Input id="addr" value={address1} onChange={(e) => setAddress1(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="city">City *</Label><Input id="city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div className={field}><Label htmlFor="state">State / region</Label><Input id="state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="zip">Postal code *</Label><Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} /></div>
        <div className={field}>
          <Label htmlFor="country">Country *</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}><Label htmlFor="phone">Phone *</Label><Input id="phone" placeholder="+1.5551234567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className={field}><Label htmlFor="email">Email *</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button type="submit" variant="brand">{submitLabel}</Button>
      </div>
    </form>
  )
}
