import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { getTheme } from '../themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useSelector((s: RootState) => s.appearance.themeId)

  useEffect(() => {
    const theme = getTheme(themeId)
    const root = document.documentElement
    root.style.setProperty('--bg-gradient', `linear-gradient(${theme.gradient})`)
    root.style.setProperty('--glass-bg', `rgba(255,255,255,${theme.glassOpacity})`)
    root.style.setProperty('--glass-border', `rgba(255,255,255,${theme.glassBorder})`)
    root.style.setProperty('--accent', theme.accentColor)
    root.style.setProperty('--text-primary', theme.textPrimary)
    root.style.setProperty('--text-secondary', theme.textSecondary)
  }, [themeId])

  return <>{children}</>
}
