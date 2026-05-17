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
