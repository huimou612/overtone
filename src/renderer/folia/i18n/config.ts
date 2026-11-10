import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zhCN from './locales/zh-CN';

// Lab i18n: the subset of keys the extracted wall, chrome and lyric modules
// ask for. zh-CN is the default; en is the fallback.

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    lng: 'zh-CN',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
