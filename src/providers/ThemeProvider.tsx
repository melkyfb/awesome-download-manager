import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useSelector } from 'react-redux'
import { ThemeProvider as MuiThemeProvider, CssBaseline, createTheme } from '@mui/material'
import type { RootState } from '../store'
import { getTheme } from '../themes'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/500.css'
import '@fontsource/fira-sans/700.css'

const FONT_FAMILIES: Record<string, string> = {
  'inter': '"Inter", sans-serif',
  'roboto': '"Roboto", sans-serif',
  'nunito': '"Nunito", sans-serif',
  'fira-sans': '"Fira Sans", sans-serif',
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useSelector((s: RootState) => s.appearance.themeId)
  const fontId = useSelector((s: RootState) => s.appearance.fontId)

  const theme = useMemo(() => {
    const base = getTheme(themeId)
    const fontFamily = FONT_FAMILIES[fontId] ?? FONT_FAMILIES['inter']
    return createTheme(base, {
      typography: { fontFamily, allVariants: { fontFamily } },
    })
  }, [themeId, fontId])

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}
