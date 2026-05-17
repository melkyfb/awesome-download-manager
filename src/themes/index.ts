export type ThemeGroup = 'dark' | 'mid' | 'light' | 'country' | 'special'

export interface Theme {
  id: string
  name: string
  group: ThemeGroup
  gradient: string
  glassOpacity: number
  glassBorder: number
  accentColor: string
  textPrimary: string
  textSecondary: string
}

export const THEMES: Theme[] = [
  // Ultra Dark
  { id: 'dark-glass',  name: 'Dark Glass',   group: 'dark', gradient: '135deg, #0f0c29, #302b63, #24243e', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#7C4DFF', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'black-piano', name: 'Black Piano',  group: 'dark', gradient: '135deg, #000000, #111111',           glassOpacity: 0.08, glassBorder: 0.14, accentColor: '#e0e0e0', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.45)' },
  { id: 'obsidian',    name: 'Obsidian',     group: 'dark', gradient: '135deg, #0a0a0a, #1a0a2e',           glassOpacity: 0.09, glassBorder: 0.15, accentColor: '#9c27b0', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.48)' },
  { id: 'void',        name: 'Void',         group: 'dark', gradient: '135deg, #050505, #0d1117',           glassOpacity: 0.07, glassBorder: 0.12, accentColor: '#58a6ff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.45)' },
  { id: 'abyss',       name: 'Abyss',        group: 'dark', gradient: '135deg, #0d0d0d, #1a1a2e, #16213e', glassOpacity: 0.08, glassBorder: 0.13, accentColor: '#4fc3f7', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.46)' },
  // Mid
  { id: 'dusk',        name: 'Dusk',         group: 'mid', gradient: '135deg, #2d1b69, #4a3080, #6b46c1', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#a78bfa', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'slate',       name: 'Slate',        group: 'mid', gradient: '135deg, #1e2a4a, #2d3f6b, #3d5491', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#60a5fa', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'coffee',      name: 'Coffee',       group: 'mid', gradient: '135deg, #2c1810, #5c3d2e, #8b5e3c', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#d97706', textPrimary: '#fff8f0', textSecondary: 'rgba(255,240,220,0.55)' },
  { id: 'forest',      name: 'Forest',       group: 'mid', gradient: '135deg, #1a2f1a, #2d5a2d, #3d7a3d', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#4ade80', textPrimary: '#f0fff4', textSecondary: 'rgba(220,255,230,0.52)' },
  { id: 'neon-rouge',  name: 'Neon Rouge',   group: 'mid', gradient: '135deg, #1a1a2e, #e94560, #0f3460', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#e94560', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'cyberpunk',   name: 'Cyberpunk',    group: 'mid', gradient: '135deg, #0f3460, #533483, #e94560', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#f0e040', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  // Light
  { id: 'frost',  name: 'Frost', group: 'light', gradient: '135deg, #e0eafc, #cfdef3', glassOpacity: 0.55, glassBorder: 0.70, accentColor: '#3b82f6', textPrimary: '#111827', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'sky',    name: 'Sky',   group: 'light', gradient: '135deg, #a8edea, #fed6e3', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#10b981', textPrimary: '#111827', textSecondary: 'rgba(0,0,0,0.48)' },
  { id: 'peach',  name: 'Peach', group: 'light', gradient: '135deg, #ffecd2, #fcb69f', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#f97316', textPrimary: '#1f1f1f', textSecondary: 'rgba(0,0,0,0.48)' },
  { id: 'mint',   name: 'Mint',  group: 'light', gradient: '135deg, #d4fc79, #96e6a1', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#16a34a', textPrimary: '#1f1f1f', textSecondary: 'rgba(0,0,0,0.48)' },
  // Countries
  { id: 'brasil',      name: '🇧🇷 Brasil',        group: 'country', gradient: '150deg, #009c3b, #ffdf00, #002776', glassOpacity: 0.12, glassBorder: 0.22, accentColor: '#ffdf00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.55)' },
  { id: 'usa',         name: '🇺🇸 Estados Unidos', group: 'country', gradient: '135deg, #B22234, #6a6aa0, #3C3B6E', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'germany',     name: '🇩🇪 Alemanha',       group: 'country', gradient: '135deg, #1a1a1a, #CC0000, #FFCE00', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFCE00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'argentina',   name: '🇦🇷 Argentina',      group: 'country', gradient: '135deg, #74acdf, #ffffff, #74acdf', glassOpacity: 0.45, glassBorder: 0.60, accentColor: '#74acdf', textPrimary: '#1a1a3e', textSecondary: 'rgba(0,0,80,0.50)' },
  { id: 'france',      name: '🇫🇷 França',         group: 'country', gradient: '135deg, #002395, #8888cc, #ED2939', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'uk',          name: '🇬🇧 Reino Unido',    group: 'country', gradient: '135deg, #012169, #8b3a52, #C8102E', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'japan',       name: '🇯🇵 Japão',          group: 'country', gradient: '135deg, #BC002D, #cccccc',           glassOpacity: 0.40, glassBorder: 0.55, accentColor: '#BC002D', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'china',       name: '🇨🇳 China',          group: 'country', gradient: '135deg, #DE2910, #FFDE00',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#FFDE00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'india',       name: '🇮🇳 Índia',          group: 'country', gradient: '135deg, #FF9933, #e8e8e8, #138808', glassOpacity: 0.40, glassBorder: 0.55, accentColor: '#000080', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'mexico',      name: '🇲🇽 México',         group: 'country', gradient: '135deg, #006847, #e8e8e8, #CE1126', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#006847', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'italy',       name: '🇮🇹 Itália',         group: 'country', gradient: '135deg, #009246, #e8e8e8, #CE2B37', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#009246', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'spain',       name: '🇪🇸 Espanha',        group: 'country', gradient: '135deg, #AA151B, #F1BF00',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#F1BF00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'canada',      name: '🇨🇦 Canadá',         group: 'country', gradient: '135deg, #FF0000, #f0f0f0, #FF0000', glassOpacity: 0.45, glassBorder: 0.62, accentColor: '#FF0000', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'south-korea', name: '🇰🇷 Coreia do Sul',  group: 'country', gradient: '135deg, #003478, #cccccc, #CD2E3A', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#CD2E3A', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'portugal',    name: '🇵🇹 Portugal',       group: 'country', gradient: '135deg, #006600, #CC0000',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#ffdd00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'eu',          name: '🇪🇺 Europa',         group: 'country', gradient: '135deg, #003399, #FFDD00',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFDD00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'australia',   name: '🇦🇺 Austrália',      group: 'country', gradient: '135deg, #00008B, #CC0000',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFD700', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  // Special
  { id: 'lgbt', name: '🏳️‍🌈 LGBT Pride', group: 'special', gradient: '90deg, #FF0018, #FFA52C, #FFFF41, #008018, #0000F9, #86007D', glassOpacity: 0.15, glassBorder: 0.25, accentColor: '#FFA52C', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.55)' },
  { id: 'poke', name: '🎮 Poké',         group: 'special', gradient: '135deg, #CC0000, #1a1a1a, #FFD700',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFD700', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'dbz',  name: '⚡ DBZ',           group: 'special', gradient: '135deg, #FF6B00, #FFD700, #1a6bcc',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#FFD700', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
]

export const GROUP_LABELS: Record<ThemeGroup, string> = {
  dark: 'Escuros',
  mid: 'Intermediários',
  light: 'Claros',
  country: 'Países',
  special: 'Especiais',
}

export function getTheme(id: string): Theme {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}
