# UI Redesign — Glassmorphism, Temas, Fontes e i18n

## Goal

Redesenhar a interface do Awesome Download Manager para glassmorphism com ~35 temas selecionáveis, ~25 fontes, suporte a 10 idiomas (i18n com react-i18next) e settings reorganizado em abas (Geral, Download, Personalização, IA).

## Architecture

**Três providers globais** envolvem a árvore React:
- `ThemeProvider` — aplica variáveis CSS do tema ativo no `<html>`
- `FontProvider` — injeta a fonte do Google Fonts e aplica `font-family` no `body`
- `LanguageProvider` — configura o `i18next` com o idioma salvo

Cada provider lê seu valor do Redux (`appearanceSlice`) e persiste via `invoke('save_settings_cmd')` ao mudar. O fundo glassmorphism (gradiente animado) vive em `AppBackground.tsx` e usa variáveis CSS definidas pelo tema.

## Tech Stack

- **react-i18next** + **i18next** para i18n (lazy-load por idioma)
- **Google Fonts** carregadas dinamicamente via `<link>` injetado no `<head>`
- **CSS custom properties** (`--bg-gradient-start`, `--bg-gradient-end`, `--glass-bg`, `--glass-border`, `--accent`) para o sistema de temas
- Tailwind continua para layout/utilitários; glassmorphism via `backdrop-filter` inline ou classes customizadas
- Temas e fontes definidos em `src/themes/index.ts` e `src/fonts/index.ts` como arrays de objetos plain

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/themes/index.ts` | Criar | Catálogo de ~35 temas com `id`, `name`, `group`, `gradient`, `glassOpacity`, `accentColor` |
| `src/fonts/index.ts` | Criar | Catálogo de ~25 fontes com `id`, `name`, `family`, `googleUrl`, `category` |
| `src/locales/en.json` | Criar | Strings inglês |
| `src/locales/pt.json` | Criar | Strings português (padrão) |
| `src/locales/es.json` | Criar | Espanhol |
| `src/locales/fr.json` | Criar | Francês |
| `src/locales/zh.json` | Criar | Mandarim |
| `src/locales/hi.json` | Criar | Hindi |
| `src/locales/ar.json` | Criar | Árabe |
| `src/locales/ru.json` | Criar | Russo |
| `src/locales/bn.json` | Criar | Bengali |
| `src/locales/id.json` | Criar | Indonésio |
| `src/i18n.ts` | Criar | Configura i18next com lazy-load dos JSONs |
| `src/store/appearanceSlice.ts` | Criar | Redux: `themeId`, `fontId`, `language` |
| `src/providers/ThemeProvider.tsx` | Criar | Aplica variáveis CSS do tema no `<html>` |
| `src/providers/FontProvider.tsx` | Criar | Injeta `<link>` Google Fonts + aplica no `body` |
| `src/components/AppBackground.tsx` | Criar | `div` de fundo com `background: var(--bg-gradient)` e efeito parallax sutil |
| `src/components/SettingsPage.tsx` | Modificar | Reorganizar em 4 abas: Geral, Download, Personalização, IA |
| `src/components/DownloadCard.tsx` | Modificar | Glassmorphism: `backdrop-filter`, `bg-white/10`, `border-white/20` |
| `src/components/DownloadCardExpanded.tsx` | Modificar | Mesmos ajustes visuais |
| `src/components/GlobalSpeedBar.tsx` | Modificar | Vidro no header |
| `src/components/AddDownloadModal.tsx` | Modificar | Modal glass |
| `src/App.tsx` | Modificar | Envolver com providers, adicionar `AppBackground` |
| `src/types/index.ts` | Modificar | Adicionar `language`, `theme_id`, `font_id` ao `Config` |
| `src-tauri/src/config/settings.rs` | Modificar | Salvar/carregar `theme_id`, `font_id`, `language` |

---

## Theme System

Cada tema é um objeto `Theme`:

```ts
interface Theme {
  id: string
  name: string
  group: 'dark' | 'mid' | 'light' | 'country' | 'special'
  gradient: string          // CSS gradient, ex: "135deg, #0f0c29, #302b63"
  glassOpacity: number      // 0.08–0.20
  glassBorder: number       // 0.12–0.35 opacity da borda
  accentColor: string       // cor de destaque para badges e barras
  textPrimary: string       // #fff ou #111
  textSecondary: string     // rgba(255,255,255,0.5) ou rgba(0,0,0,0.5)
}
```

**Grupos e temas:**

- **Ultra Escuros** (5): Dark Glass *(padrão)*, Black Piano, Obsidian, Void, Abyss
- **Intermediários** (6): Dusk, Slate, Coffee, Forest, Neon Rouge, Cyberpunk
- **Claros** (4): Frost, Sky, Peach, Mint
- **Países** (16): Brasil, EUA, Alemanha, Argentina, França, UK, Japão, China, Índia, México, Itália, Espanha, Canadá, Coreia do Sul, Portugal, EU
- **Especiais** (3): LGBT Pride, Poké, DBZ

O `ThemeProvider` aplica no `<html>`:
```css
--bg-gradient: linear-gradient(theme.gradient);
--glass-bg: rgba(255,255,255, theme.glassOpacity);
--glass-border: rgba(255,255,255, theme.glassBorder);
--accent: theme.accentColor;
--text-primary: theme.textPrimary;
--text-secondary: theme.textSecondary;
```

---

## Font System

Cada fonte é um objeto `Font`:

```ts
interface Font {
  id: string
  name: string
  family: string            // valor CSS font-family
  googleUrl: string         // URL parcial para Google Fonts
  category: 'serious' | 'tech' | 'fun' | 'mono'
}
```

**Fontes confirmadas (~25):**

Sérias: Inter, Geist, Plus Jakarta Sans, DM Sans, IBM Plex Sans, Sora, Figtree, Lexend, Barlow, Mulish
Tech: Outfit, Space Grotesk, Urbanist, Oxanium, Exo 2, Rajdhani, Bebas Neue, JetBrains Mono
Divertidas: Pacifico, Fredoka One, Boogaloo, Comfortaa, Righteous, Lilita One, Baloo 2, Bubblegum Sans

O `FontProvider` injeta o `<link>` e aplica `document.body.style.fontFamily`.

---

## i18n

10 idiomas com react-i18next. Strings cobertas:

```json
{
  "nav": { "newDownload": "...", "settings": "..." },
  "download": { "active": "...", "paused": "...", "complete": "...", "error": "...", "cancelled": "..." },
  "card": { "pause": "...", "resume": "...", "delete": "...", "eta": "ETA {{time}}", "chunkSpeeds": "..." },
  "settings": {
    "tabs": { "general": "...", "download": "...", "appearance": "...", "ai": "..." },
    "general": { "language": "...", "startWithSystem": "...", "minimizeToTray": "...", "notifications": "..." },
    "download": { "destFolder": "...", "maxSpeed": "...", "chunks": "...", "retries": "...", "sha256": "..." },
    "appearance": { "theme": "...", "font": "...", "groups": { "dark": "...", "mid": "...", "light": "...", "countries": "...", "special": "..." } },
    "ai": { "provider": "...", "apiKey": "...", "searchProvider": "...", "virusTotal": "..." },
    "save": "...", "cancel": "..."
  },
  "empty": { "title": "...", "subtitle": "..." }
}
```

Idiomas: Português (padrão), English, 中文, Español, Français, العربية, हिन्दी, Русский, বাংলা, Indonesia.

Idiomas RTL (Árabe): adicionar `dir="rtl"` no `<html>` quando ativo.

---

## Settings — 4 Abas

**Geral**: idioma (grid 2×5 de flags + nome) + comportamento (3 toggles: iniciar com sistema, minimizar na bandeja, notificações).

**Download**: pasta destino (input + browse), velocidade máxima KB/s, chunks paralelos (1–16), tentativas em erro (1–5), toggle SHA256.

**Personalização**:
- Tema: filter chips por grupo → grid de bolinhas coloridas → nome do tema ativo
- Fonte: grid 2 colunas mostrando nome na própria fonte + categoria tag → link "ver todas (N)"

**IA**: provider dropdown, API key (password + save/delete), search provider dropdown, VirusTotal key.

---

## glassmorphism — Cards

Todos os cards e modais substituem classes Tailwind estáticas por variáveis CSS:

```
background: var(--glass-bg)               /* rgba(255,255,255, opacity) */
border: 1px solid var(--glass-border)
backdrop-filter: blur(12px)
color: var(--text-primary)
```

A barra de progresso usa `var(--accent)` como cor. Badges de status usam `var(--accent)` com opacidade reduzida.

---

## Redux — appearanceSlice

```ts
interface AppearanceState {
  themeId: string    // 'dark-glass' padrão
  fontId: string     // 'inter' padrão
  language: string   // 'pt' padrão
}
```

Persistido em settings via `invoke('save_settings_cmd')` a cada mudança. Carregado em `App.tsx` init junto com o resto do config.

---

## Rust — Settings

Adicionar campos ao JSON de settings:
```rust
pub theme_id: String,    // default "dark-glass"
pub font_id: String,     // default "inter"
pub language: String,    // default "pt"
```

Retrocompatível: `serde(default)` nos três campos.
