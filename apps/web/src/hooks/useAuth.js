import { useState, useEffect } from 'react';

export function useAuth() {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        fetch('/api/auth/me', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
            .then(r => r.json())
            .then(data => {
                setUser(data.authenticated ? data.user : null);
            })
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('auth_token');
        setUser(null);
        window.location.href = '/login';
    };

    return { user, loading, logout };
}
