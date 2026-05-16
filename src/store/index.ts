import { configureStore } from '@reduxjs/toolkit'
import downloadsReducer from './downloadsSlice'
import configReducer from './configSlice'
import uiReducer from './uiSlice'
import appearanceReducer from './appearanceSlice'

export const store = configureStore({
  reducer: {
    downloads: downloadsReducer,
    config: configReducer,
    ui: uiReducer,
    appearance: appearanceReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
