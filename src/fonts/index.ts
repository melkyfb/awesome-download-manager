export type FontCategory = 'serious' | 'tech' | 'fun' | 'mono'

export interface Font {
  id: string
  name: string
  family: string
  googleParams: string
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
