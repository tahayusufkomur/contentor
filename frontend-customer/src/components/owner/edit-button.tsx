'use client'

import { Pencil } from 'lucide-react'

interface EditButtonProps {
  onClick: () => void
  onboardingStep?: number | null
}

export function EditButton({ onClick, onboardingStep }: EditButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
      aria-label="Edit your site"
    >
      <Pencil className="h-4 w-4" />
      <span>Edit site</span>
      {onboardingStep !== null && onboardingStep !== undefined && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {onboardingStep}
        </span>
      )}
    </button>
  )
}
