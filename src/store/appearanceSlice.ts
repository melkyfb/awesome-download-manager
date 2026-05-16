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
      if (action.payload.themeId !== undefined) state.themeId = action.payload.themeId
      if (action.payload.fontId !== undefined) state.fontId = action.payload.fontId
      if (action.payload.language !== undefined) state.language = action.payload.language
    },
  },
})

export const { setTheme, setFont, setLanguage, setAppearance } = appearanceSlice.actions
export default appearanceSlice.reducer
