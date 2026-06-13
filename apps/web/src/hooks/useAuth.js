import { useState, useEffect } from 'react';

// Module-level cache: every useAuth() consumer shares a single /api/auth/me
// request instead of each firing its own (navbar, page, etc all mount at once).
let authState = { user: null, loading: true };
let authPromise = null;
const listeners = new Set();

function notify() {
    listeners.forEach(fn => fn(authState));
}

function fetchAuth() {
    if (authPromise) return authPromise;
    const token = localStorage.getItem('auth_token');
    authPromise = fetch('/api/auth/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
        .then(r => r.json())
        .then(data => {
            authState = { user: data.authenticated ? data.user : null, loading: false };
        })
        .catch(() => {
            authState = { user: null, loading: false };
        })
        .finally(notify);
    return authPromise;
}

export function useAuth() {
    const [state, setState] = useState(authState);

    useEffect(() => {
        listeners.add(setState);
        fetchAuth();
        return () => listeners.delete(setState);
    }, []);

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {
            console.error('Logout request failed:', e);
        }
        localStorage.removeItem('auth_token');
        authState = { user: null, loading: false };
        authPromise = null;
        notify();
        window.location.href = '/login';
    };

    return { ...state, logout };
}
