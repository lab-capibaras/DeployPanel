import { useState, useEffect } from 'react';
import { getPrefs, subscribePrefs } from '../store/prefs';
import es from './es';
import en from './en';

const locales = { es, en };

/**
 * useTranslation()
 * Returns the translation object for the current language.
 * Only components calling this hook re-render when language changes.
 */
export function useTranslation() {
  const [lang, setLang] = useState(() => getPrefs().lang);

  useEffect(() => {
    return subscribePrefs((prefs) => {
      setLang(prefs.lang);
    });
  }, []);

  return locales[lang] ?? locales.es;
}
