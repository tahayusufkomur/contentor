'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size={collapsed ? 'icon' : 'sm'}
      className={collapsed ? 'w-full justify-center' : 'w-full justify-start gap-3'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      {!collapsed && <span className="text-sm">Toggle theme</span>}
    </Button>
  )
}
