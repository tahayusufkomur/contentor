'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EditButton } from './edit-button'
import { BrandTab } from './brand-tab'
import { NavbarTab } from './navbar-tab'
import { SectionsTab } from './sections-tab'
import { X, Palette, Navigation, LayoutList, CheckCircle2 } from 'lucide-react'
import type { TenantConfig } from '@/types/tenant'

type Tab = 'brand' | 'navbar' | 'sections'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'brand', label: 'Brand', icon: <Palette className="h-4 w-4" /> },
  { id: 'navbar', label: 'Navbar', icon: <Navigation className="h-4 w-4" /> },
  { id: 'sections', label: 'Sections', icon: <LayoutList className="h-4 w-4" /> },
]

const ONBOARDING_ORDER: Tab[] = ['brand', 'navbar', 'sections']

interface EditSidebarProps {
  initialConfig: TenantConfig
}

export function EditSidebar({ initialConfig }: EditSidebarProps) {
  const router = useRouter()
  const [open, setOpen] = useState(!initialConfig.onboarding_completed)
  const [activeTab, setActiveTab] = useState<Tab>('brand')
  const [config, setConfig] = useState<TenantConfig>(initialConfig)
  const [savedTabs, setSavedTabs] = useState<Set<Tab>>(new Set())

  // If onboarding not done, auto-open and track saved tabs
  const isOnboarding = !config.onboarding_completed
  const onboardingRemaining = isOnboarding
    ? ONBOARDING_ORDER.filter((t) => !savedTabs.has(t)).length
    : null

  const handleSaved = useCallback(
    async (updated: Partial<TenantConfig>) => {
      setConfig((prev) => ({ ...prev, ...updated }))
      setSavedTabs((prev) => new Set(Array.from(prev).concat(activeTab)))
      router.refresh()

      // Mark onboarding complete when all 3 tabs saved
      if (isOnboarding) {
        const newSaved = new Set(Array.from(savedTabs).concat(activeTab))
        if (ONBOARDING_ORDER.every((t) => newSaved.has(t))) {
          await fetch('/api/admin/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onboarding_completed: true }),
          })
          setConfig((prev) => ({ ...prev, onboarding_completed: true }))
        }
      }
    },
    [activeTab, savedTabs, isOnboarding, router],
  )

  return (
    <>
      <EditButton onClick={() => setOpen(true)} onboardingStep={onboardingRemaining} />

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[95vw] flex-col bg-background shadow-2xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Edit site</h2>
            {isOnboarding && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {ONBOARDING_ORDER.filter((t) => savedTabs.has(t)).length} / 3 steps complete
              </p>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Onboarding progress bar */}
        {isOnboarding && (
          <div className="flex gap-0.5 px-5 py-3">
            {ONBOARDING_ORDER.map((t) => (
              <div
                key={t}
                className={`h-1 flex-1 rounded-full transition-colors ${savedTabs.has(t) ? 'bg-primary' : 'bg-border'}`}
              />
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {savedTabs.has(tab.id) && (
                <CheckCircle2 className="absolute right-2 top-2 h-3 w-3 text-primary" />
              )}
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeTab === 'brand' && <BrandTab config={config} onSaved={handleSaved} />}
          {activeTab === 'navbar' && <NavbarTab config={config} onSaved={handleSaved} />}
          {activeTab === 'sections' && <SectionsTab config={config} onSaved={handleSaved} />}
        </div>

        {/* Onboarding completion toast */}
        {config.onboarding_completed && savedTabs.size >= 3 && (
          <div className="border-t px-5 py-4 bg-primary/5">
            <p className="text-xs text-center text-muted-foreground">
              🎉 Your site is set up! Changes take effect immediately.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
