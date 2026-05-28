import { useState, useEffect } from 'react';
import { getUser, login as storeLogin, logout as storeLogout, subscribeAuth } from '../store/auth';

export function useAuth() {
  const [user, setUser] = useState(() => getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check auth on mount, simulating a small delay to prevent layout flicker and mimic real session check
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 150);

    const unsubscribe = subscribeAuth((newUser) => {
      setUser(newUser);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const login = (email, password) => {
    // Validate credentials if needed, but for stubs we can just sign them in.
    storeLogin(email);
  };

  const logout = () => {
    storeLogout();
  };

  return {
    user,
    loading,
    login,
    logout,
  };
}
