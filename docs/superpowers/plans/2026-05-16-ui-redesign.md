# UI Redesign — Glassmorphism, Temas, Fontes e i18n

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a interface para glassmorphism com ~35 temas, ~25 fontes e 10 idiomas, tudo selecionável nas configurações organizadas em 4 abas.

**Architecture:** Um `appearanceSlice` Redux guarda `themeId`, `fontId` e `language`; dois providers React (`ThemeProvider`, `FontProvider`) aplicam CSS custom properties e Google Fonts dinamicamente; `react-i18next` carrega JSON de tradução por idioma. O fundo glassmorphism vive em `AppBackground`, e todos os cards usam `var(--glass-bg)` / `var(--glass-border)` / `var(--accent)`.

**Tech Stack:** React 19, Redux Toolkit, react-i18next, i18next, Google Fonts (dynamic `<link>`), CSS custom properties, Tailwind (layout apenas), Tauri v2 Rust backend.

---

## File Map

| Arquivo | Ação |
|---|---|
| `src/store/appearanceSlice.ts` | Criar |
| `src/themes/index.ts` | Criar |
| `src/fonts/index.ts` | Criar |
| `src/i18n.ts` | Criar |
| `src/locales/{pt,en,es,fr,zh,hi,ar,ru,bn,id}.json` | Criar (10 arquivos) |
| `src/providers/ThemeProvider.tsx` | Criar |
| `src/providers/FontProvider.tsx` | Criar |
| `src/components/AppBackground.tsx` | Criar |
| `src/types/index.ts` | Modificar — adicionar campos ao `Config` |
| `src/store/configSlice.ts` | Modificar — incluir novos campos |
| `src/App.tsx` | Modificar — providers + i18n init |
| `src/components/DownloadCard.tsx` | Modificar — glassmorphism |
| `src/components/DownloadCardExpanded.tsx` | Modificar — glassmorphism |
| `src/components/GlobalSpeedBar.tsx` | Modificar — glassmorphism |
| `src/components/AddDownloadModal.tsx` | Modificar — glassmorphism |
| `src/components/SettingsPage.tsx` | Modificar — 4 abas |
| `src-tauri/src/config/settings.rs` | Modificar — theme_id, font_id, language |

---

### Task 1: Install packages + appearanceSlice

**Files:**
- Create: `src/store/appearanceSlice.ts`
- Modify: `src/store/index.ts` (or wherever the store is configured)

- [ ] **Step 1: Install react-i18next**

```bash
cd /home/melkyfb/githubmelkyfb/awesome-download-manager
npm install react-i18next i18next
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Create appearanceSlice**

Create `src/store/appearanceSlice.ts`:

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AppearanceState {
  themeId: string
  fontId: string
  language: string
}

const initialState: AppearanceState = {
  themeId: 'dark-glass',
  fontId: 'inter',
  language: 'pt',
}

export const appearanceSlice = createSlice({
  name: 'appearance',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<string>) => {
      state.themeId = action.payload
    },
    setFont: (state, action: PayloadAction<string>) => {
      state.fontId = action.payload
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload
    },
    setAppearance: (state, action: PayloadAction<Partial<AppearanceState>>) => {
      if (action.payload.themeId) state.themeId = action.payload.themeId
      if (action.payload.fontId) state.fontId = action.payload.fontId
      if (action.payload.language) state.language = action.payload.language
    },
  },
})

export const { setTheme, setFont, setLanguage, setAppearance } = appearanceSlice.actions
export default appearanceSlice.reducer
```

- [ ] **Step 3: Register slice in store**

Read `src/store/index.ts` (or `src/store.ts`). Add:

```ts
import appearanceReducer from './appearanceSlice'

// inside configureStore reducers:
appearance: appearanceReducer,
```

Also update the `RootState` export if needed (RTK infers it automatically from `configureStore`).

- [ ] **Step 4: Write test**

Create `src/store/appearanceSlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import reducer, { setTheme, setFont, setLanguage, setAppearance } from './appearanceSlice'

describe('appearanceSlice', () => {
  it('has correct initial state', () => {
    const s = reducer(undefined, { type: '@@init' })
    expect(s.themeId).toBe('dark-glass')
    expect(s.fontId).toBe('inter')
    expect(s.language).toBe('pt')
  })

  it('setTheme updates themeId', () => {
    const s = reducer(undefined, setTheme('brasil'))
    expect(s.themeId).toBe('brasil')
  })

  it('setFont updates fontId', () => {
    const s = reducer(undefined, setFont('pacifico'))
    expect(s.fontId).toBe('pacifico')
  })

  it('setLanguage updates language', () => {
    const s = reducer(undefined, setLanguage('en'))
    expect(s.language).toBe('en')
  })

  it('setAppearance partial update', () => {
    const s = reducer(undefined, setAppearance({ themeId: 'poke' }))
    expect(s.themeId).toBe('poke')
    expect(s.fontId).toBe('inter') // unchanged
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/store/appearanceSlice.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/store/appearanceSlice.ts src/store/appearanceSlice.test.ts package.json package-lock.json
git commit -m "feat: add appearanceSlice for theme/font/language + install react-i18next"
```

---

### Task 2: Rust Settings — theme_id, font_id, language

**Files:**
- Modify: `src-tauri/src/config/settings.rs`
- Modify: `src/types/index.ts`
- Modify: `src/store/configSlice.ts`

- [ ] **Step 1: Add fields to Settings struct**

In `src-tauri/src/config/settings.rs`, change the `Settings` struct and its `Default` impl:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub dest_folder: String,
    pub max_speed: u64,
    pub chunks: u8,
    pub ai_provider: Option<String>,
    pub search_provider: Option<String>,
    pub ai_enabled: bool,
    pub theme_id: String,
    pub font_id: String,
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            dest_folder: default_download_dir(),
            max_speed: 0,
            chunks: 8,
            ai_provider: None,
            search_provider: None,
            ai_enabled: false,
            theme_id: "dark-glass".to_string(),
            font_id: "inter".to_string(),
            language: "pt".to_string(),
        }
    }
}
```

- [ ] **Step 2: Update load_settings**

Add at the end of `load_settings`, before the `ai_enabled` line:

```rust
if let Ok(Some(v)) = repo.get_setting("theme_id") { s.theme_id = v; }
if let Ok(Some(v)) = repo.get_setting("font_id") { s.font_id = v; }
if let Ok(Some(v)) = repo.get_setting("language") { s.language = v; }
```

- [ ] **Step 3: Update save_settings**

Add at the end of `save_settings`, before the closing `Ok(())`:

```rust
repo.set_setting("theme_id", &settings.theme_id)?;
repo.set_setting("font_id", &settings.font_id)?;
repo.set_setting("language", &settings.language)?;
```

- [ ] **Step 4: Update test for save/load**

In the existing `save_and_load_settings` test, add the new fields to the Settings literal:

```rust
let s = Settings {
    dest_folder: "/tmp/downloads".to_string(),
    max_speed: 102400,
    chunks: 4,
    ai_provider: Some("claude".to_string()),
    search_provider: Some("brave".to_string()),
    ai_enabled: false,
    theme_id: "brasil".to_string(),
    font_id: "pacifico".to_string(),
    language: "en".to_string(),
};
save_settings(&repo, &s).unwrap();
let loaded = load_settings(&repo);
// existing asserts +
assert_eq!(loaded.theme_id, "brasil");
assert_eq!(loaded.font_id, "pacifico");
assert_eq!(loaded.language, "en");
```

- [ ] **Step 5: Build + test Rust**

```bash
source ~/.cargo/env && cargo test -p awesome-download-manager 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Update TypeScript Config type**

In `src/types/index.ts`, add to `Config`:

```ts
export interface Config {
  dest_folder: string
  max_speed: number
  chunks: number
  ai_provider: string | null
  search_provider: string | null
  ai_enabled: boolean
  theme_id: string
  font_id: string
  language: string
}
```

- [ ] **Step 7: Update configSlice**

Read `src/store/configSlice.ts`. Ensure the initial state and `setConfig` action include the new fields with defaults:

```ts
const initialState: Config = {
  dest_folder: '',
  max_speed: 0,
  chunks: 8,
  ai_provider: null,
  search_provider: null,
  ai_enabled: false,
  theme_id: 'dark-glass',
  font_id: 'inter',
  language: 'pt',
}
```

- [ ] **Step 8: Wire config → appearanceSlice in App.tsx init**

In `src/App.tsx`, after `dispatch(setConfig(settings))`, add:

```ts
import { setAppearance } from './store/appearanceSlice'
// ...
dispatch(setAppearance({
  themeId: settings.theme_id,
  fontId: settings.font_id,
  language: settings.language,
}))
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/config/settings.rs src/types/index.ts src/store/configSlice.ts src/App.tsx
git commit -m "feat: add theme_id/font_id/language to settings (Rust + TS)"
```

---

### Task 3: Theme Catalog

**Files:**
- Create: `src/themes/index.ts`

- [ ] **Step 1: Create theme types and catalog**

Create `src/themes/index.ts`:

```ts
export type ThemeGroup = 'dark' | 'mid' | 'light' | 'country' | 'special'

export interface Theme {
  id: string
  name: string
  group: ThemeGroup
  gradient: string       // full CSS gradient value, e.g. "135deg, #0f0c29, #302b63"
  glassOpacity: number   // 0.06 – 0.20
  glassBorder: number    // 0.10 – 0.40
  accentColor: string
  textPrimary: string
  textSecondary: string
}

export const THEMES: Theme[] = [
  // ── Ultra Dark ───────────────────────────────────────────
  { id: 'dark-glass',  name: 'Dark Glass',   group: 'dark', gradient: '135deg, #0f0c29, #302b63, #24243e', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#7C4DFF', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'black-piano', name: 'Black Piano',  group: 'dark', gradient: '135deg, #000000, #111111',           glassOpacity: 0.08, glassBorder: 0.14, accentColor: '#e0e0e0', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.45)' },
  { id: 'obsidian',    name: 'Obsidian',     group: 'dark', gradient: '135deg, #0a0a0a, #1a0a2e',           glassOpacity: 0.09, glassBorder: 0.15, accentColor: '#9c27b0', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.48)' },
  { id: 'void',        name: 'Void',         group: 'dark', gradient: '135deg, #050505, #0d1117',           glassOpacity: 0.07, glassBorder: 0.12, accentColor: '#58a6ff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.45)' },
  { id: 'abyss',       name: 'Abyss',        group: 'dark', gradient: '135deg, #0d0d0d, #1a1a2e, #16213e', glassOpacity: 0.08, glassBorder: 0.13, accentColor: '#4fc3f7', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.46)' },

  // ── Mid ──────────────────────────────────────────────────
  { id: 'dusk',        name: 'Dusk',         group: 'mid', gradient: '135deg, #2d1b69, #4a3080, #6b46c1', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#a78bfa', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'slate',       name: 'Slate',        group: 'mid', gradient: '135deg, #1e2a4a, #2d3f6b, #3d5491', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#60a5fa', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'coffee',      name: 'Coffee',       group: 'mid', gradient: '135deg, #2c1810, #5c3d2e, #8b5e3c', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#d97706', textPrimary: '#fff8f0', textSecondary: 'rgba(255,240,220,0.55)' },
  { id: 'forest',      name: 'Forest',       group: 'mid', gradient: '135deg, #1a2f1a, #2d5a2d, #3d7a3d', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#4ade80', textPrimary: '#f0fff4', textSecondary: 'rgba(220,255,230,0.52)' },
  { id: 'neon-rouge',  name: 'Neon Rouge',   group: 'mid', gradient: '135deg, #1a1a2e, #e94560, #0f3460', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#e94560', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'cyberpunk',   name: 'Cyberpunk',    group: 'mid', gradient: '135deg, #0f3460, #533483, #e94560', glassOpacity: 0.10, glassBorder: 0.18, accentColor: '#f0e040', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },

  // ── Light ────────────────────────────────────────────────
  { id: 'frost',  name: 'Frost', group: 'light', gradient: '135deg, #e0eafc, #cfdef3', glassOpacity: 0.55, glassBorder: 0.70, accentColor: '#3b82f6', textPrimary: '#111827', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'sky',    name: 'Sky',   group: 'light', gradient: '135deg, #a8edea, #fed6e3', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#10b981', textPrimary: '#111827', textSecondary: 'rgba(0,0,0,0.48)' },
  { id: 'peach',  name: 'Peach', group: 'light', gradient: '135deg, #ffecd2, #fcb69f', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#f97316', textPrimary: '#1f1f1f', textSecondary: 'rgba(0,0,0,0.48)' },
  { id: 'mint',   name: 'Mint',  group: 'light', gradient: '135deg, #d4fc79, #96e6a1', glassOpacity: 0.50, glassBorder: 0.65, accentColor: '#16a34a', textPrimary: '#1f1f1f', textSecondary: 'rgba(0,0,0,0.48)' },

  // ── Countries ────────────────────────────────────────────
  { id: 'brasil',        name: '🇧🇷 Brasil',        group: 'country', gradient: '150deg, #009c3b, #ffdf00, #002776', glassOpacity: 0.12, glassBorder: 0.22, accentColor: '#ffdf00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.55)' },
  { id: 'usa',           name: '🇺🇸 Estados Unidos', group: 'country', gradient: '135deg, #B22234, #6a6aa0, #3C3B6E', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'germany',       name: '🇩🇪 Alemanha',       group: 'country', gradient: '135deg, #1a1a1a, #CC0000, #FFCE00', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFCE00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'argentina',     name: '🇦🇷 Argentina',      group: 'country', gradient: '135deg, #74acdf, #ffffff, #74acdf', glassOpacity: 0.45, glassBorder: 0.60, accentColor: '#74acdf', textPrimary: '#1a1a3e', textSecondary: 'rgba(0,0,80,0.50)' },
  { id: 'france',        name: '🇫🇷 França',         group: 'country', gradient: '135deg, #002395, #8888cc, #ED2939', glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'uk',            name: '🇬🇧 Reino Unido',    group: 'country', gradient: '135deg, #012169, #8b3a52, #C8102E', glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#ffffff', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'japan',         name: '🇯🇵 Japão',          group: 'country', gradient: '135deg, #BC002D, #cccccc',           glassOpacity: 0.40, glassBorder: 0.55, accentColor: '#BC002D', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'china',         name: '🇨🇳 China',          group: 'country', gradient: '135deg, #DE2910, #FFDE00',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#FFDE00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'india',         name: '🇮🇳 Índia',          group: 'country', gradient: '135deg, #FF9933, #e8e8e8, #138808', glassOpacity: 0.40, glassBorder: 0.55, accentColor: '#000080', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'mexico',        name: '🇲🇽 México',         group: 'country', gradient: '135deg, #006847, #e8e8e8, #CE1126', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#006847', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'italy',         name: '🇮🇹 Itália',         group: 'country', gradient: '135deg, #009246, #e8e8e8, #CE2B37', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#009246', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'spain',         name: '🇪🇸 Espanha',        group: 'country', gradient: '135deg, #AA151B, #F1BF00',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#F1BF00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
  { id: 'canada',        name: '🇨🇦 Canadá',         group: 'country', gradient: '135deg, #FF0000, #f0f0f0, #FF0000', glassOpacity: 0.45, glassBorder: 0.62, accentColor: '#FF0000', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'south-korea',   name: '🇰🇷 Coreia do Sul',  group: 'country', gradient: '135deg, #003478, #cccccc, #CD2E3A', glassOpacity: 0.42, glassBorder: 0.58, accentColor: '#CD2E3A', textPrimary: '#1a1a1a', textSecondary: 'rgba(0,0,0,0.50)' },
  { id: 'portugal',      name: '🇵🇹 Portugal',       group: 'country', gradient: '135deg, #006600, #CC0000',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#ffdd00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'eu',            name: '🇪🇺 Europa',         group: 'country', gradient: '135deg, #003399, #FFDD00',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFDD00', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },

  // ── Special ──────────────────────────────────────────────
  { id: 'lgbt',  name: '🏳️‍🌈 LGBT Pride', group: 'special', gradient: '90deg, #FF0018, #FFA52C, #FFFF41, #008018, #0000F9, #86007D', glassOpacity: 0.15, glassBorder: 0.25, accentColor: '#FFA52C', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.55)' },
  { id: 'poke',  name: '🎮 Poké',         group: 'special', gradient: '135deg, #CC0000, #1a1a1a, #FFD700',           glassOpacity: 0.11, glassBorder: 0.18, accentColor: '#FFD700', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.50)' },
  { id: 'dbz',   name: '⚡ DBZ',           group: 'special', gradient: '135deg, #FF6B00, #FFD700, #1a6bcc',           glassOpacity: 0.12, glassBorder: 0.20, accentColor: '#FFD700', textPrimary: '#ffffff', textSecondary: 'rgba(255,255,255,0.52)' },
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
```

- [ ] **Step 2: Write test**

Create `src/themes/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { THEMES, getTheme } from './index'

describe('THEMES catalog', () => {
  it('has at least 35 themes', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(35)
  })

  it('all themes have required fields', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.gradient).toBeTruthy()
      expect(t.accentColor).toBeTruthy()
    }
  })

  it('getTheme returns correct theme', () => {
    expect(getTheme('dark-glass').name).toBe('Dark Glass')
  })

  it('getTheme falls back to first theme on unknown id', () => {
    expect(getTheme('nonexistent').id).toBe('dark-glass')
  })
})
```

- [ ] **Step 3: Run test**

```bash
npx vitest run src/themes/index.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/themes/index.ts src/themes/index.test.ts
git commit -m "feat: theme catalog with 35 themes"
```

---

### Task 4: ThemeProvider

**Files:**
- Create: `src/providers/ThemeProvider.tsx`

- [ ] **Step 1: Create ThemeProvider**

Create `src/providers/ThemeProvider.tsx`:

```tsx
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
```

- [ ] **Step 2: Add CSS variables to index.css**

In `src/index.css` (or the main CSS entry), add defaults so the app renders correctly before the provider fires:

```css
:root {
  --bg-gradient: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  --glass-bg: rgba(255, 255, 255, 0.10);
  --glass-border: rgba(255, 255, 255, 0.18);
  --accent: #7C4DFF;
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.50);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/providers/ThemeProvider.tsx src/index.css
git commit -m "feat: ThemeProvider applies CSS custom properties per theme"
```

---

### Task 5: Font Catalog + FontProvider

**Files:**
- Create: `src/fonts/index.ts`
- Create: `src/providers/FontProvider.tsx`

- [ ] **Step 1: Create font catalog**

Create `src/fonts/index.ts`:

```ts
export type FontCategory = 'serious' | 'tech' | 'fun' | 'mono'

export interface Font {
  id: string
  name: string
  family: string
  googleParams: string   // used in Google Fonts URL
  category: FontCategory
}

export const FONTS: Font[] = [
  // Serious
  { id: 'inter',          name: 'Inter',            family: "'Inter', sans-serif",            googleParams: 'Inter:wght@400;500;600;700',            category: 'serious' },
  { id: 'geist',          name: 'Geist',            family: "'Geist', sans-serif",            googleParams: 'Geist:wght@400;500;600;700',            category: 'serious' },
  { id: 'plus-jakarta',   name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif", googleParams: 'Plus+Jakarta+Sans:wght@400;500;600;700', category: 'serious' },
  { id: 'dm-sans',        name: 'DM Sans',          family: "'DM Sans', sans-serif",          googleParams: 'DM+Sans:wght@400;500;600;700',          category: 'serious' },
  { id: 'ibm-plex',       name: 'IBM Plex Sans',    family: "'IBM Plex Sans', sans-serif",    googleParams: 'IBM+Plex+Sans:wght@400;500;600;700',    category: 'serious' },
  { id: 'sora',           name: 'Sora',             family: "'Sora', sans-serif",             googleParams: 'Sora:wght@400;500;600;700',             category: 'serious' },
  { id: 'figtree',        name: 'Figtree',          family: "'Figtree', sans-serif",          googleParams: 'Figtree:wght@400;500;600;700',          category: 'serious' },
  { id: 'lexend',         name: 'Lexend',           family: "'Lexend', sans-serif",           googleParams: 'Lexend:wght@400;500;600;700',           category: 'serious' },
  { id: 'barlow',         name: 'Barlow',           family: "'Barlow', sans-serif",           googleParams: 'Barlow:wght@400;500;600;700',           category: 'serious' },
  { id: 'mulish',         name: 'Mulish',           family: "'Mulish', sans-serif",           googleParams: 'Mulish:wght@400;500;600;700',           category: 'serious' },

  // Tech
  { id: 'outfit',         name: 'Outfit',           family: "'Outfit', sans-serif",           googleParams: 'Outfit:wght@400;500;600;700',           category: 'tech' },
  { id: 'space-grotesk',  name: 'Space Grotesk',    family: "'Space Grotesk', sans-serif",    googleParams: 'Space+Grotesk:wght@400;500;600;700',    category: 'tech' },
  { id: 'urbanist',       name: 'Urbanist',         family: "'Urbanist', sans-serif",         googleParams: 'Urbanist:wght@400;500;600;700',         category: 'tech' },
  { id: 'oxanium',        name: 'Oxanium',          family: "'Oxanium', sans-serif",          googleParams: 'Oxanium:wght@400;500;600;700',          category: 'tech' },
  { id: 'exo-2',          name: 'Exo 2',            family: "'Exo 2', sans-serif",            googleParams: 'Exo+2:wght@400;500;600;700',            category: 'tech' },
  { id: 'rajdhani',       name: 'Rajdhani',         family: "'Rajdhani', sans-serif",         googleParams: 'Rajdhani:wght@400;500;600;700',         category: 'tech' },
  { id: 'bebas-neue',     name: 'Bebas Neue',       family: "'Bebas Neue', sans-serif",       googleParams: 'Bebas+Neue',                            category: 'tech' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono',   family: "'JetBrains Mono', monospace",    googleParams: 'JetBrains+Mono:wght@400;500;600;700',   category: 'mono' },

  // Fun
  { id: 'pacifico',       name: 'Pacifico',         family: "'Pacifico', cursive",            googleParams: 'Pacifico',                              category: 'fun' },
  { id: 'fredoka-one',    name: 'Fredoka One',      family: "'Fredoka One', cursive",         googleParams: 'Fredoka+One',                           category: 'fun' },
  { id: 'boogaloo',       name: 'Boogaloo',         family: "'Boogaloo', cursive",            googleParams: 'Boogaloo',                              category: 'fun' },
  { id: 'comfortaa',      name: 'Comfortaa',        family: "'Comfortaa', cursive",           googleParams: 'Comfortaa:wght@400;500;600;700',        category: 'fun' },
  { id: 'righteous',      name: 'Righteous',        family: "'Righteous', cursive",           googleParams: 'Righteous',                             category: 'fun' },
  { id: 'lilita-one',     name: 'Lilita One',       family: "'Lilita One', cursive",          googleParams: 'Lilita+One',                            category: 'fun' },
  { id: 'baloo-2',        name: 'Baloo 2',          family: "'Baloo 2', cursive",             googleParams: 'Baloo+2:wght@400;500;600;700',          category: 'fun' },
  { id: 'bubblegum-sans', name: 'Bubblegum Sans',   family: "'Bubblegum Sans', cursive",      googleParams: 'Bubblegum+Sans',                        category: 'fun' },
]

export function getFont(id: string): Font {
  return FONTS.find(f => f.id === id) ?? FONTS[0]
}
```

- [ ] **Step 2: Create FontProvider**

Create `src/providers/FontProvider.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { getFont } from '../fonts'

export function FontProvider({ children }: { children: React.ReactNode }) {
  const fontId = useSelector((s: RootState) => s.appearance.fontId)
  const linkRef = useRef<HTMLLinkElement | null>(null)

  useEffect(() => {
    const font = getFont(fontId)
    const url = `https://fonts.googleapis.com/css2?family=${font.googleParams}&display=swap`

    // Replace previous <link> rather than accumulating them
    if (linkRef.current) {
      linkRef.current.href = url
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      document.head.appendChild(link)
      linkRef.current = link
    }

    document.body.style.fontFamily = font.family
  }, [fontId])

  return <>{children}</>
}
```

- [ ] **Step 3: Write test for font catalog**

Create `src/fonts/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FONTS, getFont } from './index'

describe('FONTS catalog', () => {
  it('has at least 25 fonts', () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(25)
  })

  it('all fonts have required fields', () => {
    for (const f of FONTS) {
      expect(f.id).toBeTruthy()
      expect(f.family).toBeTruthy()
      expect(f.googleParams).toBeTruthy()
    }
  })

  it('getFont returns correct font', () => {
    expect(getFont('inter').name).toBe('Inter')
  })

  it('getFont falls back to Inter on unknown id', () => {
    expect(getFont('unknown').id).toBe('inter')
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/fonts/index.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/fonts/index.ts src/fonts/index.test.ts src/providers/FontProvider.tsx
git commit -m "feat: font catalog with 26 fonts + FontProvider"
```

---

### Task 6: i18n Setup + 10 Locale Files

**Files:**
- Create: `src/i18n.ts`
- Create: `src/locales/pt.json`, `en.json`, `es.json`, `fr.json`, `zh.json`, `hi.json`, `ar.json`, `ru.json`, `bn.json`, `id.json`

- [ ] **Step 1: Create i18n config**

Create `src/i18n.ts`:

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import pt from './locales/pt.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import zh from './locales/zh.json'
import hi from './locales/hi.json'
import ar from './locales/ar.json'
import ru from './locales/ru.json'
import bn from './locales/bn.json'
import id from './locales/id.json'

i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es }, fr: { translation: fr }, zh: { translation: zh }, hi: { translation: hi }, ar: { translation: ar }, ru: { translation: ru }, bn: { translation: bn }, id: { translation: id } },
  lng: 'pt',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 2: Create pt.json (Portuguese — default)**

Create `src/locales/pt.json`:

```json
{
  "nav": { "newDownload": "+ Novo Download", "settings": "Configurações" },
  "status": { "active": "ativo", "paused": "pausado", "complete": "completo", "error": "erro", "cancelled": "cancelado" },
  "card": { "pause": "Pausar", "resume": "Retomar", "delete": "Excluir", "eta": "ETA {{time}}", "chunkSpeeds": "Velocidade por Chunk", "sha256": "SHA256" },
  "empty": { "title": "Nenhum download ainda", "subtitle": "Clique em \"+ Novo Download\" para começar" },
  "settings": {
    "title": "Configurações",
    "save": "Salvar", "cancel": "Cancelar",
    "tabs": { "general": "🌐 Geral", "download": "⬇ Download", "appearance": "🎨 Personalização", "ai": "🤖 IA" },
    "general": { "language": "Idioma", "startWithSystem": "Iniciar com o sistema", "minimizeToTray": "Minimizar na bandeja", "notifications": "Notificações ao completar" },
    "download": { "destFolder": "Pasta de destino", "browse": "Alterar", "maxSpeed": "Velocidade máxima (KB/s, 0 = ilimitado)", "chunks": "Chunks paralelos (1–16)", "retries": "Tentativas em caso de erro", "sha256": "Verificar SHA256 ao completar" },
    "appearance": { "theme": "Tema", "font": "Fonte", "viewAll": "ver todas ({{count}})", "groups": { "dark": "Escuros", "mid": "Intermediários", "light": "Claros", "country": "Países", "special": "Especiais" } },
    "ai": { "provider": "Provedor de IA", "apiKey": "API Key", "configured": "(configurada)", "saveKey": "Salvar", "deleteKey": "Excluir", "searchProvider": "Provedor de Busca", "vtKey": "VirusTotal API Key (opcional)" }
  },
  "modal": { "title": "Novo Download", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Destino", "browse": "Selecionar", "start": "Iniciar Download", "cancel": "Cancelar" },
  "aiButtons": { "summary": "AI Summary", "malware": "Check Malware", "mirrors": "Find Mirrors", "disabled": "Configure uma API key de IA nas Configurações", "banner": "Funções de IA desativadas.", "configure": "Configurar →" }
}
```

- [ ] **Step 3: Create en.json (English)**

Create `src/locales/en.json`:

```json
{
  "nav": { "newDownload": "+ New Download", "settings": "Settings" },
  "status": { "active": "active", "paused": "paused", "complete": "complete", "error": "error", "cancelled": "cancelled" },
  "card": { "pause": "Pause", "resume": "Resume", "delete": "Delete", "eta": "ETA {{time}}", "chunkSpeeds": "Chunk Speeds", "sha256": "SHA256" },
  "empty": { "title": "No downloads yet", "subtitle": "Click \"+ New Download\" to get started" },
  "settings": {
    "title": "Settings",
    "save": "Save Settings", "cancel": "Cancel",
    "tabs": { "general": "🌐 General", "download": "⬇ Download", "appearance": "🎨 Appearance", "ai": "🤖 AI" },
    "general": { "language": "Language", "startWithSystem": "Start with system", "minimizeToTray": "Minimize to tray", "notifications": "Notifications on complete" },
    "download": { "destFolder": "Destination Folder", "browse": "Browse", "maxSpeed": "Max Speed (KB/s, 0 = unlimited)", "chunks": "Parallel Chunks (1–16)", "retries": "Retries on error", "sha256": "Verify SHA256 on complete" },
    "appearance": { "theme": "Theme", "font": "Font", "viewAll": "view all ({{count}})", "groups": { "dark": "Dark", "mid": "Mid-tone", "light": "Light", "country": "Countries", "special": "Special" } },
    "ai": { "provider": "AI Provider", "apiKey": "API Key", "configured": "(configured)", "saveKey": "Save", "deleteKey": "Delete", "searchProvider": "Search Provider", "vtKey": "VirusTotal API Key (optional)" }
  },
  "modal": { "title": "New Download", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Destination", "browse": "Browse", "start": "Start Download", "cancel": "Cancel" },
  "aiButtons": { "summary": "AI Summary", "malware": "Check Malware", "mirrors": "Find Mirrors", "disabled": "Configure an AI API key in Settings", "banner": "AI features disabled.", "configure": "Configure →" }
}
```

- [ ] **Step 4: Create remaining 8 locale files**

Create `src/locales/es.json`:
```json
{
  "nav": { "newDownload": "+ Nueva Descarga", "settings": "Configuración" },
  "status": { "active": "activo", "paused": "pausado", "complete": "completo", "error": "error", "cancelled": "cancelado" },
  "card": { "pause": "Pausar", "resume": "Reanudar", "delete": "Eliminar", "eta": "ETA {{time}}", "chunkSpeeds": "Velocidad por Chunk", "sha256": "SHA256" },
  "empty": { "title": "Sin descargas aún", "subtitle": "Haz clic en \"+ Nueva Descarga\" para empezar" },
  "settings": { "title": "Configuración", "save": "Guardar", "cancel": "Cancelar", "tabs": { "general": "🌐 General", "download": "⬇ Descarga", "appearance": "🎨 Apariencia", "ai": "🤖 IA" }, "general": { "language": "Idioma", "startWithSystem": "Iniciar con el sistema", "minimizeToTray": "Minimizar en bandeja", "notifications": "Notificaciones al completar" }, "download": { "destFolder": "Carpeta de destino", "browse": "Explorar", "maxSpeed": "Velocidad máx. (KB/s, 0 = sin límite)", "chunks": "Chunks paralelos (1–16)", "retries": "Reintentos en error", "sha256": "Verificar SHA256 al completar" }, "appearance": { "theme": "Tema", "font": "Fuente", "viewAll": "ver todas ({{count}})", "groups": { "dark": "Oscuros", "mid": "Intermedios", "light": "Claros", "country": "Países", "special": "Especiales" } }, "ai": { "provider": "Proveedor IA", "apiKey": "API Key", "configured": "(configurada)", "saveKey": "Guardar", "deleteKey": "Eliminar", "searchProvider": "Proveedor de búsqueda", "vtKey": "VirusTotal API Key (opcional)" } },
  "modal": { "title": "Nueva Descarga", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Destino", "browse": "Seleccionar", "start": "Iniciar Descarga", "cancel": "Cancelar" },
  "aiButtons": { "summary": "Resumen IA", "malware": "Analizar Malware", "mirrors": "Buscar Espejos", "disabled": "Configure una API key de IA en Configuración", "banner": "Funciones de IA desactivadas.", "configure": "Configurar →" }
}
```

Create `src/locales/fr.json`:
```json
{
  "nav": { "newDownload": "+ Nouveau Téléchargement", "settings": "Paramètres" },
  "status": { "active": "actif", "paused": "en pause", "complete": "terminé", "error": "erreur", "cancelled": "annulé" },
  "card": { "pause": "Pause", "resume": "Reprendre", "delete": "Supprimer", "eta": "ETA {{time}}", "chunkSpeeds": "Vitesse par Chunk", "sha256": "SHA256" },
  "empty": { "title": "Aucun téléchargement", "subtitle": "Cliquez sur \"+ Nouveau Téléchargement\" pour commencer" },
  "settings": { "title": "Paramètres", "save": "Enregistrer", "cancel": "Annuler", "tabs": { "general": "🌐 Général", "download": "⬇ Téléchargement", "appearance": "🎨 Apparence", "ai": "🤖 IA" }, "general": { "language": "Langue", "startWithSystem": "Démarrer avec le système", "minimizeToTray": "Réduire dans la barre", "notifications": "Notifications à la fin" }, "download": { "destFolder": "Dossier de destination", "browse": "Parcourir", "maxSpeed": "Vitesse max (KB/s, 0 = illimité)", "chunks": "Chunks parallèles (1–16)", "retries": "Tentatives en cas d'erreur", "sha256": "Vérifier SHA256 à la fin" }, "appearance": { "theme": "Thème", "font": "Police", "viewAll": "voir toutes ({{count}})", "groups": { "dark": "Sombres", "mid": "Intermédiaires", "light": "Clairs", "country": "Pays", "special": "Spéciaux" } }, "ai": { "provider": "Fournisseur IA", "apiKey": "Clé API", "configured": "(configurée)", "saveKey": "Enregistrer", "deleteKey": "Supprimer", "searchProvider": "Fournisseur de recherche", "vtKey": "Clé API VirusTotal (optionnel)" } },
  "modal": { "title": "Nouveau Téléchargement", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Destination", "browse": "Parcourir", "start": "Lancer le téléchargement", "cancel": "Annuler" },
  "aiButtons": { "summary": "Résumé IA", "malware": "Analyser Malware", "mirrors": "Trouver Miroirs", "disabled": "Configurez une clé API IA dans Paramètres", "banner": "Fonctions IA désactivées.", "configure": "Configurer →" }
}
```

Create `src/locales/zh.json`:
```json
{
  "nav": { "newDownload": "+ 新建下载", "settings": "设置" },
  "status": { "active": "下载中", "paused": "已暂停", "complete": "已完成", "error": "错误", "cancelled": "已取消" },
  "card": { "pause": "暂停", "resume": "继续", "delete": "删除", "eta": "剩余 {{time}}", "chunkSpeeds": "分块速度", "sha256": "SHA256" },
  "empty": { "title": "暂无下载", "subtitle": "点击「+ 新建下载」开始" },
  "settings": { "title": "设置", "save": "保存", "cancel": "取消", "tabs": { "general": "🌐 常规", "download": "⬇ 下载", "appearance": "🎨 外观", "ai": "🤖 AI" }, "general": { "language": "语言", "startWithSystem": "开机自启", "minimizeToTray": "最小化到托盘", "notifications": "完成时通知" }, "download": { "destFolder": "下载文件夹", "browse": "浏览", "maxSpeed": "最大速度 (KB/s, 0 = 不限)", "chunks": "并发块数 (1–16)", "retries": "失败重试次数", "sha256": "完成后验证 SHA256" }, "appearance": { "theme": "主题", "font": "字体", "viewAll": "查看全部 ({{count}})", "groups": { "dark": "深色", "mid": "中间色", "light": "浅色", "country": "国家", "special": "特殊" } }, "ai": { "provider": "AI 提供商", "apiKey": "API 密钥", "configured": "(已配置)", "saveKey": "保存", "deleteKey": "删除", "searchProvider": "搜索提供商", "vtKey": "VirusTotal API 密钥（可选）" } },
  "modal": { "title": "新建下载", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "保存路径", "browse": "浏览", "start": "开始下载", "cancel": "取消" },
  "aiButtons": { "summary": "AI 摘要", "malware": "恶意软件检测", "mirrors": "查找镜像", "disabled": "请在设置中配置 AI API 密钥", "banner": "AI 功能已禁用。", "configure": "去配置 →" }
}
```

Create `src/locales/hi.json`:
```json
{
  "nav": { "newDownload": "+ नया डाउनलोड", "settings": "सेटिंग्स" },
  "status": { "active": "सक्रिय", "paused": "रुका हुआ", "complete": "पूर्ण", "error": "त्रुटि", "cancelled": "रद्द" },
  "card": { "pause": "रोकें", "resume": "जारी रखें", "delete": "हटाएं", "eta": "ETA {{time}}", "chunkSpeeds": "चंक गति", "sha256": "SHA256" },
  "empty": { "title": "अभी कोई डाउनलोड नहीं", "subtitle": "शुरू करने के लिए \"+ नया डाउनलोड\" पर क्लिक करें" },
  "settings": { "title": "सेटिंग्स", "save": "सहेजें", "cancel": "रद्द करें", "tabs": { "general": "🌐 सामान्य", "download": "⬇ डाउनलोड", "appearance": "🎨 रूप", "ai": "🤖 AI" }, "general": { "language": "भाषा", "startWithSystem": "सिस्टम के साथ शुरू करें", "minimizeToTray": "ट्रे में छोटा करें", "notifications": "पूर्ण होने पर सूचना" }, "download": { "destFolder": "डाउनलोड फ़ोल्डर", "browse": "ब्राउज़", "maxSpeed": "अधिकतम गति (KB/s, 0 = असीमित)", "chunks": "समानांतर चंक्स (1–16)", "retries": "त्रुटि पर पुनः प्रयास", "sha256": "पूर्ण होने पर SHA256 जांचें" }, "appearance": { "theme": "थीम", "font": "फ़ॉन्ट", "viewAll": "सभी देखें ({{count}})", "groups": { "dark": "गहरे", "mid": "मध्यम", "light": "हल्के", "country": "देश", "special": "विशेष" } }, "ai": { "provider": "AI प्रदाता", "apiKey": "API कुंजी", "configured": "(कॉन्फ़िगर किया)", "saveKey": "सहेजें", "deleteKey": "हटाएं", "searchProvider": "खोज प्रदाता", "vtKey": "VirusTotal API कुंजी (वैकल्पिक)" } },
  "modal": { "title": "नया डाउनलोड", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "गंतव्य", "browse": "चुनें", "start": "डाउनलोड शुरू करें", "cancel": "रद्द करें" },
  "aiButtons": { "summary": "AI सारांश", "malware": "मैलवेयर जांचें", "mirrors": "मिरर खोजें", "disabled": "सेटिंग्स में AI API कुंजी सेट करें", "banner": "AI सुविधाएं अक्षम हैं।", "configure": "सेट करें →" }
}
```

Create `src/locales/ar.json`:
```json
{
  "nav": { "newDownload": "+ تنزيل جديد", "settings": "الإعدادات" },
  "status": { "active": "نشط", "paused": "متوقف", "complete": "مكتمل", "error": "خطأ", "cancelled": "ملغى" },
  "card": { "pause": "إيقاف مؤقت", "resume": "استئناف", "delete": "حذف", "eta": "الوقت المتبقي {{time}}", "chunkSpeeds": "سرعة القطع", "sha256": "SHA256" },
  "empty": { "title": "لا توجد تنزيلات بعد", "subtitle": "انقر على \"+ تنزيل جديد\" للبدء" },
  "settings": { "title": "الإعدادات", "save": "حفظ", "cancel": "إلغاء", "tabs": { "general": "🌐 عام", "download": "⬇ تنزيل", "appearance": "🎨 المظهر", "ai": "🤖 الذكاء الاصطناعي" }, "general": { "language": "اللغة", "startWithSystem": "بدء مع النظام", "minimizeToTray": "تصغير إلى الشريط", "notifications": "إشعارات عند الاكتمال" }, "download": { "destFolder": "مجلد الوجهة", "browse": "تصفح", "maxSpeed": "السرعة القصوى (KB/s، 0 = غير محدود)", "chunks": "قطع متوازية (1–16)", "retries": "إعادة المحاولة عند الخطأ", "sha256": "التحقق من SHA256 عند الاكتمال" }, "appearance": { "theme": "السمة", "font": "الخط", "viewAll": "عرض الكل ({{count}})", "groups": { "dark": "داكن", "mid": "متوسط", "light": "فاتح", "country": "الدول", "special": "خاصة" } }, "ai": { "provider": "مزود الذكاء الاصطناعي", "apiKey": "مفتاح API", "configured": "(مُعد)", "saveKey": "حفظ", "deleteKey": "حذف", "searchProvider": "مزود البحث", "vtKey": "مفتاح VirusTotal (اختياري)" } },
  "modal": { "title": "تنزيل جديد", "urlLabel": "الرابط", "urlPlaceholder": "https://...", "destLabel": "الوجهة", "browse": "تصفح", "start": "بدء التنزيل", "cancel": "إلغاء" },
  "aiButtons": { "summary": "ملخص AI", "malware": "فحص البرامج الضارة", "mirrors": "البحث عن مرايا", "disabled": "قم بتعيين مفتاح AI API في الإعدادات", "banner": "ميزات الذكاء الاصطناعي معطلة.", "configure": "تكوين ←" }
}
```

Create `src/locales/ru.json`:
```json
{
  "nav": { "newDownload": "+ Новая загрузка", "settings": "Настройки" },
  "status": { "active": "активна", "paused": "на паузе", "complete": "завершена", "error": "ошибка", "cancelled": "отменена" },
  "card": { "pause": "Пауза", "resume": "Продолжить", "delete": "Удалить", "eta": "ETA {{time}}", "chunkSpeeds": "Скорость частей", "sha256": "SHA256" },
  "empty": { "title": "Нет загрузок", "subtitle": "Нажмите «+ Новая загрузка», чтобы начать" },
  "settings": { "title": "Настройки", "save": "Сохранить", "cancel": "Отмена", "tabs": { "general": "🌐 Общие", "download": "⬇ Загрузка", "appearance": "🎨 Внешний вид", "ai": "🤖 ИИ" }, "general": { "language": "Язык", "startWithSystem": "Запускать вместе с системой", "minimizeToTray": "Сворачивать в трей", "notifications": "Уведомлять по завершении" }, "download": { "destFolder": "Папка загрузок", "browse": "Обзор", "maxSpeed": "Макс. скорость (КБ/с, 0 = без лимита)", "chunks": "Параллельные части (1–16)", "retries": "Попытки при ошибке", "sha256": "Проверять SHA256 по завершении" }, "appearance": { "theme": "Тема", "font": "Шрифт", "viewAll": "показать все ({{count}})", "groups": { "dark": "Тёмные", "mid": "Средние", "light": "Светлые", "country": "Страны", "special": "Особые" } }, "ai": { "provider": "Провайдер ИИ", "apiKey": "API-ключ", "configured": "(настроен)", "saveKey": "Сохранить", "deleteKey": "Удалить", "searchProvider": "Поисковый провайдер", "vtKey": "API-ключ VirusTotal (опционально)" } },
  "modal": { "title": "Новая загрузка", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Куда сохранить", "browse": "Обзор", "start": "Начать загрузку", "cancel": "Отмена" },
  "aiButtons": { "summary": "Сводка ИИ", "malware": "Проверить на вирусы", "mirrors": "Найти зеркала", "disabled": "Настройте API-ключ ИИ в Настройках", "banner": "Функции ИИ отключены.", "configure": "Настроить →" }
}
```

Create `src/locales/bn.json`:
```json
{
  "nav": { "newDownload": "+ নতুন ডাউনলোড", "settings": "সেটিংস" },
  "status": { "active": "সক্রিয়", "paused": "বিরতি", "complete": "সম্পন্ন", "error": "ত্রুটি", "cancelled": "বাতিল" },
  "card": { "pause": "বিরতি", "resume": "চালিয়ে যান", "delete": "মুছুন", "eta": "বাকি {{time}}", "chunkSpeeds": "চাংক গতি", "sha256": "SHA256" },
  "empty": { "title": "এখনো কোনো ডাউনলোড নেই", "subtitle": "শুরু করতে \"+ নতুন ডাউনলোড\" ক্লিক করুন" },
  "settings": { "title": "সেটিংস", "save": "সংরক্ষণ", "cancel": "বাতিল", "tabs": { "general": "🌐 সাধারণ", "download": "⬇ ডাউনলোড", "appearance": "🎨 চেহারা", "ai": "🤖 AI" }, "general": { "language": "ভাষা", "startWithSystem": "সিস্টেমের সাথে শুরু", "minimizeToTray": "ট্রেতে ছোট করুন", "notifications": "সম্পন্ন হলে বিজ্ঞপ্তি" }, "download": { "destFolder": "গন্তব্য ফোল্ডার", "browse": "ব্রাউজ", "maxSpeed": "সর্বোচ্চ গতি (KB/s, 0 = সীমাহীন)", "chunks": "সমান্তরাল চাংক (1–16)", "retries": "ত্রুটিতে পুনরায় চেষ্টা", "sha256": "সম্পন্ন হলে SHA256 যাচাই" }, "appearance": { "theme": "থিম", "font": "ফন্ট", "viewAll": "সব দেখুন ({{count}})", "groups": { "dark": "গাঢ়", "mid": "মধ্যম", "light": "হালকা", "country": "দেশ", "special": "বিশেষ" } }, "ai": { "provider": "AI প্রদানকারী", "apiKey": "API কী", "configured": "(কনফিগার করা)", "saveKey": "সংরক্ষণ", "deleteKey": "মুছুন", "searchProvider": "অনুসন্ধান প্রদানকারী", "vtKey": "VirusTotal API কী (ঐচ্ছিক)" } },
  "modal": { "title": "নতুন ডাউনলোড", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "গন্তব্য", "browse": "বেছে নিন", "start": "ডাউনলোড শুরু", "cancel": "বাতিল" },
  "aiButtons": { "summary": "AI সারসংক্ষেপ", "malware": "ম্যালওয়্যার পরীক্ষা", "mirrors": "মিরর খুঁজুন", "disabled": "সেটিংসে AI API কী সেট করুন", "banner": "AI ফিচার অক্ষম।", "configure": "কনফিগার করুন →" }
}
```

Create `src/locales/id.json`:
```json
{
  "nav": { "newDownload": "+ Unduhan Baru", "settings": "Pengaturan" },
  "status": { "active": "aktif", "paused": "dijeda", "complete": "selesai", "error": "error", "cancelled": "dibatalkan" },
  "card": { "pause": "Jeda", "resume": "Lanjutkan", "delete": "Hapus", "eta": "ETA {{time}}", "chunkSpeeds": "Kecepatan Chunk", "sha256": "SHA256" },
  "empty": { "title": "Belum ada unduhan", "subtitle": "Klik \"+ Unduhan Baru\" untuk memulai" },
  "settings": { "title": "Pengaturan", "save": "Simpan", "cancel": "Batal", "tabs": { "general": "🌐 Umum", "download": "⬇ Unduhan", "appearance": "🎨 Tampilan", "ai": "🤖 AI" }, "general": { "language": "Bahasa", "startWithSystem": "Mulai dengan sistem", "minimizeToTray": "Perkecil ke tray", "notifications": "Notifikasi saat selesai" }, "download": { "destFolder": "Folder tujuan", "browse": "Pilih", "maxSpeed": "Kecepatan maks (KB/s, 0 = tanpa batas)", "chunks": "Chunk paralel (1–16)", "retries": "Percobaan ulang saat error", "sha256": "Verifikasi SHA256 saat selesai" }, "appearance": { "theme": "Tema", "font": "Font", "viewAll": "lihat semua ({{count}})", "groups": { "dark": "Gelap", "mid": "Sedang", "light": "Terang", "country": "Negara", "special": "Spesial" } }, "ai": { "provider": "Penyedia AI", "apiKey": "Kunci API", "configured": "(sudah dikonfigurasi)", "saveKey": "Simpan", "deleteKey": "Hapus", "searchProvider": "Penyedia pencarian", "vtKey": "Kunci API VirusTotal (opsional)" } },
  "modal": { "title": "Unduhan Baru", "urlLabel": "URL", "urlPlaceholder": "https://...", "destLabel": "Tujuan", "browse": "Pilih", "start": "Mulai Unduhan", "cancel": "Batal" },
  "aiButtons": { "summary": "Ringkasan AI", "malware": "Periksa Malware", "mirrors": "Cari Mirror", "disabled": "Atur kunci API AI di Pengaturan", "banner": "Fitur AI dinonaktifkan.", "configure": "Konfigurasi →" }
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/i18n.ts src/locales/
git commit -m "feat: i18n with react-i18next, 10 languages"
```

---

### Task 7: AppBackground + Wire Providers in App.tsx

**Files:**
- Create: `src/components/AppBackground.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create AppBackground**

Create `src/components/AppBackground.tsx`:

```tsx
export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-gradient)', minHeight: '100vh', transition: 'background 0.4s ease' }}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Wire providers and i18n in App.tsx**

Replace the top of `src/App.tsx` to add providers and i18n:

```tsx
import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import '../src/i18n'  // initialises i18next — adjust path if App.tsx is at src/
import type { RootState, AppDispatch } from './store'
import { setConfig } from './store/configSlice'
import { setAppearance } from './store/appearanceSlice'
import { upsertDownload } from './store/downloadsSlice'
import { useTauriEvents } from './hooks/useTauriEvents'
import { ThemeProvider } from './providers/ThemeProvider'
import { FontProvider } from './providers/FontProvider'
import { AppBackground } from './components/AppBackground'
import { GlobalSpeedBar } from './components/GlobalSpeedBar'
import { DownloadCard } from './components/DownloadCard'
import { AddDownloadModal } from './components/AddDownloadModal'
import { SettingsPage } from './components/SettingsPage'
import type { Config, Download } from './types'
```

Wrap `App.tsx` return with providers:

```tsx
export default function App() {
  const { i18n } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const downloads = useSelector((s: RootState) => Object.values(s.downloads.items))
  const addModalOpen = useSelector((s: RootState) => s.ui.addModalOpen)
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)
  const language = useSelector((s: RootState) => s.appearance.language)

  useTauriEvents()

  useEffect(() => {
    i18n.changeLanguage(language)
    // RTL support for Arabic
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language, i18n])

  useEffect(() => {
    async function init() {
      try {
        const [settings, existingDownloads] = await Promise.all([
          invoke<Config>('get_settings'),
          invoke<Download[]>('list_downloads'),
        ])
        dispatch(setConfig(settings))
        dispatch(setAppearance({
          themeId: settings.theme_id,
          fontId: settings.font_id,
          language: settings.language,
        }))
        existingDownloads.forEach(dl => dispatch(upsertDownload(dl)))
        await invoke('restart_active_downloads')
      } catch (e) {
        console.error('App init failed', e)
      }
    }
    init()
  }, [dispatch])

  const sorted = [...downloads].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <ThemeProvider>
      <FontProvider>
        <AppBackground>
          <div className="h-screen flex flex-col">
            <GlobalSpeedBar />
            <main className="flex-1 overflow-y-auto p-4 space-y-3">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
                  <p className="text-lg">{t('empty.title')}</p>
                  <p className="text-sm">{t('empty.subtitle')}</p>
                </div>
              )}
              {sorted.map(dl => <DownloadCard key={dl.id} download={dl} />)}
            </main>
            {addModalOpen && <AddDownloadModal />}
            {settingsOpen && <SettingsPage />}
          </div>
        </AppBackground>
      </FontProvider>
    </ThemeProvider>
  )
}
```

Note: add `const { t } = useTranslation()` inside the component body alongside `i18n`.

- [ ] **Step 3: Import i18n in main.tsx**

In `src/main.tsx`, add:

```ts
import './i18n'
```

before the `ReactDOM.createRoot` call. This ensures i18next initialises before any component renders.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppBackground.tsx src/App.tsx src/main.tsx
git commit -m "feat: wire ThemeProvider, FontProvider, AppBackground, i18n in App"
```

---

### Task 8: Glassmorphism — DownloadCard + DownloadCardExpanded

**Files:**
- Modify: `src/components/DownloadCard.tsx`
- Modify: `src/components/DownloadCardExpanded.tsx`

- [ ] **Step 1: Rewrite DownloadCard with glass styles**

Replace the container `<div>` className and all status/button color classes in `src/components/DownloadCard.tsx`. Key changes:

```tsx
// Card container — was: "bg-white border border-gray-200 rounded-lg p-4 ..."
<div
  style={{
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '12px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  }}
  onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
>
```

```tsx
// Filename — was: "font-medium text-gray-900 ..."
<span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }} className="truncate max-w-xs">
  {download.filename}
</span>
```

```tsx
// Status badge — was hardcoded bg-blue-500 etc.
<span style={{
  background: `color-mix(in srgb, var(--accent) 25%, transparent)`,
  color: 'var(--accent)',
  fontSize: '11px',
  padding: '2px 10px',
  borderRadius: '12px',
  border: `1px solid color-mix(in srgb, var(--accent) 40%, transparent)`,
}}>
  {t(`status.${download.status}`)}
</span>
```

```tsx
// Progress bar track
<div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', height: '4px', marginBottom: '8px' }}>
  <div style={{ background: 'var(--accent)', width: `${percent}%`, height: '4px', borderRadius: '4px', transition: 'width 0.3s' }} />
</div>
```

```tsx
// Meta text
<span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
  {percent}% · {formatBytes(download.downloaded_bytes)}
  {download.total_bytes ? ` / ${formatBytes(download.total_bytes)}` : ''}
  {download.speed_bps ? ` · ${formatSpeed(download.speed_bps)}` : ''}
  {download.eta_seconds ? ` · ${t('card.eta', { time: formatEta(download.eta_seconds) })}` : ''}
</span>
```

```tsx
// Pause button
<button onClick={handlePause} style={{ color: '#fbbf24', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
  {t('card.pause')}
</button>

// Resume button
<button onClick={handleResume} style={{ color: '#4ade80', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
  {t('card.resume')}
</button>

// Delete button
<button onClick={handleDelete} style={{ color: '#f87171', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
  {t('card.delete')}
</button>
```

Add `const { t } = useTranslation()` at the top of the component. Import `useTranslation` from `'react-i18next'`.

- [ ] **Step 2: Rewrite DownloadCardExpanded glass styles**

In `src/components/DownloadCardExpanded.tsx`:

```tsx
// Section labels
<span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
  {t('card.sha256')}
</span>

// SHA256 code block
<code style={{ fontSize: '11px', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '3px 8px' }}>
  {download.sha256}
</code>

// Chunk speed items
<span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
  #{i}: {formatBytes(speed)}/s
</span>

// URL at bottom
<div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }} className="truncate">
  {download.url}
</div>

// AI banner
<div style={{ background: 'rgba(251,191,36,0.15)', borderLeft: '3px solid #fbbf24', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#fbbf24', display: 'flex', gap: '8px', alignItems: 'center' }}>
  <span>!</span>
  <span>{t('aiButtons.banner')} <button style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{t('aiButtons.configure')}</button></span>
</div>
```

Add `const { t } = useTranslation()` at top of component.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/DownloadCard.tsx src/components/DownloadCardExpanded.tsx
git commit -m "feat: glassmorphism DownloadCard + i18n strings"
```

---

### Task 9: Glassmorphism — GlobalSpeedBar + AddDownloadModal

**Files:**
- Modify: `src/components/GlobalSpeedBar.tsx`
- Modify: `src/components/AddDownloadModal.tsx`

- [ ] **Step 1: Update GlobalSpeedBar**

Read `src/components/GlobalSpeedBar.tsx`. Replace container styling with glass:

```tsx
// Header bar
<div style={{
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderBottom: '1px solid var(--glass-border)',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}}>
```

Replace all hardcoded `text-gray-*`, `bg-*` Tailwind classes with inline styles using CSS variables. Keep flex/gap/padding Tailwind utilities — only replace color classes.

Title:
```tsx
<span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
  ADM
</span>
```

Buttons (New Download, Settings):
```tsx
// New Download button
<button
  onClick={() => dispatch(openAddModal())}
  style={{
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  }}
>
  {t('nav.newDownload')}
</button>

// Settings button
<button
  onClick={() => dispatch(openSettings())}
  style={{
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  }}
>
  {t('nav.settings')}
</button>
```

Speed display:
```tsx
<span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
  {formatBytes(globalSpeed)}/s
</span>
```

- [ ] **Step 2: Update AddDownloadModal**

Read `src/components/AddDownloadModal.tsx`. Replace modal overlay and panel:

```tsx
// Overlay
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>

// Panel
<div style={{
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--glass-border)',
  borderRadius: '16px',
  padding: '24px',
  width: '100%',
  maxWidth: '480px',
}}>
```

Labels, inputs, buttons use CSS variable colors:
```tsx
// Input fields
style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', width: '100%', outline: 'none' }}

// Primary button
style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}

// Secondary button
style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-secondary)', cursor: 'pointer' }}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GlobalSpeedBar.tsx src/components/AddDownloadModal.tsx
git commit -m "feat: glassmorphism GlobalSpeedBar + AddDownloadModal + i18n nav strings"
```

---

### Task 10: Settings Redesign — 4 Tabs with Theme + Font + Language Pickers

**Files:**
- Modify: `src/components/SettingsPage.tsx`

This is the largest component rewrite. Replace the entire `SettingsPage.tsx` with the tabbed version.

- [ ] **Step 1: Rewrite SettingsPage.tsx**

```tsx
import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../store'
import { setConfig, setAiEnabled } from '../store/configSlice'
import { setTheme, setFont, setLanguage } from '../store/appearanceSlice'
import { closeSettings } from '../store/uiSlice'
import { THEMES, GROUP_LABELS, type ThemeGroup } from '../themes'
import { FONTS, type FontCategory } from '../fonts'

const LANGUAGES = [
  { code: 'pt', flag: '🇧🇷', label: 'Português' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'bn', flag: '🇧🇩', label: 'বাংলা' },
  { code: 'id', flag: '🇮🇩', label: 'Indonesia' },
]

type Tab = 'general' | 'download' | 'appearance' | 'ai'

// Shared glass input style
const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  width: '100%',
}

export function SettingsPage() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const appearance = useSelector((s: RootState) => s.appearance)

  const [activeTab, setActiveTab] = useState<Tab>('appearance')
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(Math.round(config.max_speed / 1024))
  const [chunks, setChunks] = useState(config.chunks)
  const [aiProvider, setAiProvider] = useState(config.ai_provider ?? '')
  const [aiKey, setAiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState(config.search_provider ?? '')
  const [vtKey, setVtKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiKeyStatus, setAiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'deleted'>('idle')
  const [themeGroup, setThemeGroup] = useState<ThemeGroup>('dark')
  const [showAllFonts, setShowAllFonts] = useState(false)

  const FONT_PREVIEW_COUNT = 6
  const visibleFonts = showAllFonts ? FONTS : FONTS.slice(0, FONT_PREVIEW_COUNT)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll() {
    setSaving(true)
    setSaveError(null)
    try {
      const newConfig = {
        ...config,
        dest_folder: destFolder,
        max_speed: maxSpeedKbps * 1024,
        chunks: Math.min(16, Math.max(1, chunks)),
        ai_provider: aiProvider || null,
        search_provider: searchProvider || null,
        theme_id: appearance.themeId,
        font_id: appearance.fontId,
        language: appearance.language,
      }
      await invoke('save_settings_cmd', { settings: newConfig })
      dispatch(setConfig({ ...newConfig, ai_enabled: config.ai_enabled }))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveAiKey() {
    if (!aiKey.trim() || !aiProvider) return
    setAiKeyStatus('saving')
    try {
      await invoke('save_ai_key_cmd', { apiKey: aiKey })
      dispatch(setAiEnabled(true))
      setAiKey('')
      setAiKeyStatus('saved')
    } catch (e) {
      console.error('save_ai_key_cmd failed', e)
      setAiKeyStatus('idle')
    }
  }

  async function deleteAiKey() {
    try {
      await invoke('delete_ai_key_cmd')
      dispatch(setAiEnabled(false))
      setAiKeyStatus('deleted')
    } catch (e) {
      console.error('delete_ai_key_cmd failed', e)
    }
  }

  const panelStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderBottom: active ? `2px solid var(--accent)` : '2px solid transparent',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: active ? `2px solid var(--accent)` : '2px solid transparent',
    whiteSpace: 'nowrap' as const,
  })

  const sectionLabel: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600, letterSpacing: '0.8px',
    textTransform: 'uppercase' as const, color: 'var(--text-secondary)',
    marginBottom: '8px', marginTop: '16px',
  }

  const groupThemes = THEMES.filter(t => t.group === themeGroup)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0', borderBottom: '1px solid var(--glass-border)' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{t('settings.title')}</span>
          <button onClick={() => dispatch(closeSettings())} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', padding: '0 20px' }}>
          {(['general', 'download', 'appearance', 'ai'] as Tab[]).map(tab => (
            <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
              {t(`settings.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* ── GENERAL ── */}
          {activeTab === 'general' && (
            <div>
              <div style={sectionLabel}>{t('settings.general.language')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => dispatch(setLanguage(lang.code))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                      background: appearance.language === lang.code ? `color-mix(in srgb, var(--accent) 20%, transparent)` : 'rgba(255,255,255,0.06)',
                      border: appearance.language === lang.code ? `1px solid color-mix(in srgb, var(--accent) 50%, transparent)` : '1px solid var(--glass-border)',
                      color: 'var(--text-primary)', fontSize: '12px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── DOWNLOAD ── */}
          {activeTab === 'download' && (
            <div>
              <div style={sectionLabel}>{t('settings.download.destFolder')}</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input value={destFolder} onChange={e => setDestFolder(e.target.value)} style={glassInput} />
                <button onClick={pickFolder} style={{ ...glassInput, width: 'auto', cursor: 'pointer', whiteSpace: 'nowrap' }}>{t('settings.download.browse')}</button>
              </div>

              <div style={sectionLabel}>{t('settings.download.maxSpeed')}</div>
              <input type="number" value={maxSpeedKbps} min={0} onChange={e => setMaxSpeedKbps(Number(e.target.value))} style={{ ...glassInput, width: '120px', marginBottom: '12px' }} />

              <div style={sectionLabel}>{t('settings.download.chunks')}</div>
              <input type="number" value={chunks} min={1} max={16} onChange={e => setChunks(Number(e.target.value))} style={{ ...glassInput, width: '80px' }} />
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <div>
              {/* Theme picker */}
              <div style={sectionLabel}>{t('settings.appearance.theme')}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(['dark', 'mid', 'light', 'country', 'special'] as ThemeGroup[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setThemeGroup(g)}
                    style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                      background: themeGroup === g ? `color-mix(in srgb, var(--accent) 25%, transparent)` : 'rgba(255,255,255,0.07)',
                      border: themeGroup === g ? `1px solid color-mix(in srgb, var(--accent) 50%, transparent)` : '1px solid var(--glass-border)',
                      color: themeGroup === g ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {t(`settings.appearance.groups.${g}`)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                {groupThemes.map(theme => (
                  <button
                    key={theme.id}
                    title={theme.name}
                    onClick={() => dispatch(setTheme(theme.id))}
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: `linear-gradient(${theme.gradient})`,
                      border: appearance.themeId === theme.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      transform: appearance.themeId === theme.id ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 0.15s, border-color 0.15s',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                {THEMES.find(t => t.id === appearance.themeId)?.name ?? ''}
              </div>

              {/* Font picker */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
                <div style={sectionLabel}>{t('settings.appearance.font')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {visibleFonts.map(font => (
                    <button
                      key={font.id}
                      onClick={() => dispatch(setFont(font.id))}
                      style={{
                        padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                        background: appearance.fontId === font.id ? `color-mix(in srgb, var(--accent) 20%, transparent)` : 'rgba(255,255,255,0.06)',
                        border: appearance.fontId === font.id ? `1px solid color-mix(in srgb, var(--accent) 50%, transparent)` : '1px solid var(--glass-border)',
                        fontFamily: font.family,
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{font.name}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{font.category}</div>
                    </button>
                  ))}
                  {!showAllFonts && (
                    <button
                      onClick={() => setShowAllFonts(true)}
                      style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--glass-border)', color: 'var(--text-secondary)', fontSize: '11px' }}
                    >
                      {t('settings.appearance.viewAll', { count: FONTS.length })}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── AI ── */}
          {activeTab === 'ai' && (
            <div>
              <div style={sectionLabel}>{t('settings.ai.provider')}</div>
              <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={{ ...glassInput, marginBottom: '12px' }}>
                <option value="">—</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>

              <div style={sectionLabel}>
                {t('settings.ai.apiKey')} {config.ai_enabled && <span style={{ color: '#4ade80', marginLeft: '4px' }}>{t('settings.ai.configured')}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder={config.ai_enabled ? '(already set)' : 'sk-...'} style={glassInput} />
                <button onClick={saveAiKey} disabled={!aiKey.trim() || !aiProvider} style={{ ...glassInput, width: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {aiKeyStatus === 'saving' ? '...' : t('settings.ai.saveKey')}
                </button>
                {config.ai_enabled && (
                  <button onClick={deleteAiKey} style={{ ...glassInput, width: 'auto', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {t('settings.ai.deleteKey')}
                  </button>
                )}
              </div>

              <div style={sectionLabel}>{t('settings.ai.searchProvider')}</div>
              <select value={searchProvider} onChange={e => setSearchProvider(e.target.value)} style={{ ...glassInput, marginBottom: '12px' }}>
                <option value="">—</option>
                <option value="brave">Brave Search</option>
                <option value="serpapi">SerpAPI</option>
              </select>

              <div style={sectionLabel}>{t('settings.ai.vtKey')}</div>
              <input type="password" value={vtKey} onChange={e => setVtKey(e.target.value)} placeholder="Optional" style={glassInput} />
            </div>
          )}

          {saveError && (
            <div style={{ marginTop: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#f87171' }}>
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={() => dispatch(closeSettings())} style={{ padding: '8px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
            {t('settings.cancel')}
          </button>
          <button onClick={saveAll} disabled={saving} style={{ padding: '8px 18px', borderRadius: '8px', background: 'var(--accent)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Build Rust**

```bash
source ~/.cargo/env && cargo build 2>&1 | tail -5
```

Expected: `Finished dev profile`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPage.tsx
git commit -m "feat: settings redesign with 4 tabs, theme/font/language pickers, glassmorphism"
```

---

### Task 11: Save appearance on change + final wiring

**Files:**
- Modify: `src/components/SettingsPage.tsx` (already handles save via saveAll)
- Verify end-to-end flow

This task verifies the full loop: change theme → see it applied live → save → reload app → theme persists.

- [ ] **Step 1: Verify live preview**

The `ThemeProvider` watches `s.appearance.themeId` via `useSelector`. When `dispatch(setTheme('brasil'))` is called in SettingsPage, the CSS variables update immediately. No extra wiring needed.

- [ ] **Step 2: Verify persistence**

`saveAll()` in SettingsPage passes `theme_id: appearance.themeId`, `font_id: appearance.fontId`, `language: appearance.language` to `save_settings_cmd`. The Rust handler writes them to SQLite. On next app launch, `App.tsx` init reads them back and dispatches `setAppearance`.

- [ ] **Step 3: Final type-check + test run**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: no TypeScript errors, all tests green.

- [ ] **Step 4: Final Rust build**

```bash
source ~/.cargo/env && cargo test 2>&1 | tail -10
```

Expected: all Rust tests pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete UI redesign — glassmorphism, 35 themes, 26 fonts, 10 languages, tabbed settings"
```

---

## Self-Review

**Spec coverage:**
- ✅ ThemeProvider + CSS custom properties → Tasks 3, 4
- ✅ 35 themes in 5 groups → Task 3
- ✅ FontProvider + 26 fonts → Tasks 5
- ✅ i18n 10 languages with react-i18next → Task 6
- ✅ AppBackground glassmorphism fundo → Task 7
- ✅ DownloadCard glassmorphism → Task 8
- ✅ GlobalSpeedBar + AddDownloadModal glass → Task 9
- ✅ Settings 4 tabs (Geral, Download, Personalização, IA) → Task 10
- ✅ Theme picker with group filter + color dots → Task 10
- ✅ Font picker with "ver todas" toggle → Task 10
- ✅ Language grid with flags → Task 10
- ✅ RTL for Arabic → Task 7
- ✅ Rust settings persistence → Task 2
- ✅ appearanceSlice → Task 1

**Type consistency:** `setTheme/setFont/setLanguage` defined in Task 1, used in Task 10. `getTheme/getFont` defined in Tasks 3/5, used in Tasks 4/5. `THEMES/FONTS` defined in Tasks 3/5, used in Task 10. All consistent.

**Placeholders:** None found.
