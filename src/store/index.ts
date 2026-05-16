import { configureStore } from '@reduxjs/toolkit'
import downloadsReducer from './downloadsSlice'
import configReducer from './configSlice'
import uiReducer from './uiSlice'

export const store = configureStore({
  reducer: {
    downloads: downloadsReducer,
    config: configReducer,
    ui: uiReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
