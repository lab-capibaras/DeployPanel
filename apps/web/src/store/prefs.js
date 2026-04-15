/**
 * Module-level preferences store.
 * Mutations go directly to the DOM — no React re-renders in components
 * that don't subscribe. Only consumers of usePrefs() will re-render.
 */

const _init = {
  theme: localStorage.getItem('sd-theme') || 'dark',
  lang:  localStorage.getItem('sd-lang')  || 'es',
};

// Apply on module load (before any component mounts)
document.documentElement.classList.toggle('light-mode', _init.theme === 'light');
document.documentElement.setAttribute('data-lang', _init.lang);

let _prefs = { ..._init };
const _listeners = new Set();

function _notify() {
  _listeners.forEach(fn => fn({ ..._prefs }));
}

export function setTheme(theme) {
  _prefs.theme = theme;
  localStorage.setItem('sd-theme', theme);
  document.documentElement.classList.toggle('light-mode', theme === 'light');
  _notify();
}

export function setLang(lang) {
  _prefs.lang = lang;
  localStorage.setItem('sd-lang', lang);
  document.documentElement.setAttribute('data-lang', lang);
  _notify();
}

export function getPrefs() {
  return { ..._prefs };
}

export function subscribePrefs(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
