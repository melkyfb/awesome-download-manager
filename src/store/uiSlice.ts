import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UiState {
  expandedCardId: string | null
  addModalOpen: boolean
  settingsOpen: boolean
}

const initialState: UiState = {
  expandedCardId: null,
  addModalOpen: false,
  settingsOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setExpandedCard(state, action: PayloadAction<string | null>) {
      state.expandedCardId = action.payload
    },
    openAddModal(state) { state.addModalOpen = true },
    closeAddModal(state) { state.addModalOpen = false },
    openSettings(state) { state.settingsOpen = true },
    closeSettings(state) { state.settingsOpen = false },
  },
})

export const { setExpandedCard, openAddModal, closeAddModal, openSettings, closeSettings } = uiSlice.actions
export default uiSlice.reducer
