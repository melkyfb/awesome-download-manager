import { createTheme, type Theme } from '@mui/material/styles'

export interface ThemeMeta {
  id: string
  name: string
  theme: Theme
}

const shared = { shape: { borderRadius: 14 } }

export const THEMES: ThemeMeta[] = [
  {
    id: 'cosmos', name: 'Cosmos',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#BB86FC' }, secondary: { main: '#03DAC6' }, background: { default: '#0d0d1a', paper: '#1a1a2e' }, error: { main: '#CF6679' } } }),
  },
  {
    id: 'obsidian', name: 'Obsidian Night',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#60a5fa' }, secondary: { main: '#818cf8' }, background: { default: '#080810', paper: '#0f0f1c' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'carbon', name: 'Carbon',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#22d3ee' }, secondary: { main: '#a78bfa' }, background: { default: '#111111', paper: '#1c1c1c' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'ocean', name: 'Ocean Deep',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#2dd4bf' }, secondary: { main: '#60a5fa' }, background: { default: '#0c1a2e', paper: '#132236' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'ember', name: 'Ember',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#fb923c' }, secondary: { main: '#fbbf24' }, background: { default: '#1a0a00', paper: '#261200' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'forest', name: 'Forest',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#4ade80' }, secondary: { main: '#a3e635' }, background: { default: '#0a1a0a', paper: '#122012' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'arctic', name: 'Arctic',
    theme: createTheme({ ...shared, palette: { mode: 'light', primary: { main: '#3b82f6' }, secondary: { main: '#8b5cf6' }, background: { default: '#f0f4ff', paper: '#ffffff' }, error: { main: '#ef4444' } } }),
  },
  {
    id: 'sand', name: 'Sand',
    theme: createTheme({ ...shared, palette: { mode: 'light', primary: { main: '#d97706' }, secondary: { main: '#059669' }, background: { default: '#faf5eb', paper: '#ffffff' }, error: { main: '#ef4444' } } }),
  },
  {
    id: 'synthwave', name: 'Synthwave',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#ec4899' }, secondary: { main: '#a855f7' }, background: { default: '#0d001a', paper: '#1a0030' }, error: { main: '#f87171' } } }),
  },
  {
    id: 'royal', name: 'Royal',
    theme: createTheme({ ...shared, palette: { mode: 'dark', primary: { main: '#fbbf24' }, secondary: { main: '#e879f9' }, background: { default: '#0a0a1f', paper: '#12122e' }, error: { main: '#f87171' } } }),
  },
]

export function getTheme(id: string): Theme {
  return THEMES.find(t => t.id === id)?.theme ?? THEMES[0].theme
}
