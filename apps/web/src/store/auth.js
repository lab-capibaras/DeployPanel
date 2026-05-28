/**
 * Module-level authentication store.
 * Synchronizes login state across all components subscribing via useAuth hook.
 */

let _user = null;
try {
  const savedUser = localStorage.getItem('sd-user');
  if (savedUser) {
    _user = JSON.parse(savedUser);
  }
} catch (e) {
  console.error('Error parsing stored user:', e);
}

const _listeners = new Set();

function _notify() {
  _listeners.forEach(fn => fn(_user ? { ..._user } : null));
}

export function getUser() {
  return _user ? { ..._user } : null;
}

export function login(email) {
  _user = { email };
  localStorage.setItem('sd-user', JSON.stringify(_user));
  _notify();
}

export function logout() {
  _user = null;
  localStorage.removeItem('sd-user');
  _notify();
}

export function subscribeAuth(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
