import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UiState {
  expandedCardId: string | null
  addModalOpen: boolean
  settingsOpen: boolean
  changelogOpen: boolean
  closeDialogOpen: boolean
  prefillUrl: string
}

const initialState: UiState = {
  expandedCardId: null,
  addModalOpen: false,
  settingsOpen: false,
  changelogOpen: false,
  closeDialogOpen: false,
  prefillUrl: '',
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
    openChangelog(state) { state.changelogOpen = true },
    closeChangelog(state) { state.changelogOpen = false },
    openCloseDialog(state) { state.closeDialogOpen = true },
    closeCloseDialog(state) { state.closeDialogOpen = false },
    setPrefillUrl(state, action: PayloadAction<string>) { state.prefillUrl = action.payload },
  },
})

export const {
  setExpandedCard,
  openAddModal, closeAddModal,
  openSettings, closeSettings,
  openChangelog, closeChangelog,
  openCloseDialog, closeCloseDialog,
  setPrefillUrl,
} = uiSlice.actions
export default uiSlice.reducer
