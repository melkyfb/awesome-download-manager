import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UiState {
  expandedCardId: string | null
  addModalOpen: boolean
  settingsOpen: boolean
  changelogOpen: boolean
  closeDialogOpen: boolean
  prefillUrl: string
  downloadFilter: 'all' | 'active' | 'paused' | 'complete'
  aboutOpen: boolean
}

const initialState: UiState = {
  expandedCardId: null,
  addModalOpen: false,
  settingsOpen: false,
  changelogOpen: false,
  closeDialogOpen: false,
  prefillUrl: '',
  downloadFilter: 'all',
  aboutOpen: false,
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
    setDownloadFilter(state, action: PayloadAction<'all' | 'active' | 'paused' | 'complete'>) {
      state.downloadFilter = action.payload
    },
    openAbout(state) { state.aboutOpen = true },
    closeAbout(state) { state.aboutOpen = false },
  },
})

export const {
  setExpandedCard,
  openAddModal, closeAddModal,
  openSettings, closeSettings,
  openChangelog, closeChangelog,
  openCloseDialog, closeCloseDialog,
  setPrefillUrl,
  setDownloadFilter,
  openAbout, closeAbout,
} = uiSlice.actions
export default uiSlice.reducer
