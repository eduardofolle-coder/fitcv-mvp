import { useCallback, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

export function useAuth() {
  const { token, user, setToken, setUser, logout: storeLogout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.login(email, password);
        api.setToken(response.accessToken);
        setToken(response.accessToken);
        setUser(response.user);
        localStorage.setItem('token', response.accessToken);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response.user;
      } catch (err: any) {
        const message = err.response?.data?.error || 'Login failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setToken, setUser]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.register(email, password);
        api.setToken(response.accessToken);
        setToken(response.accessToken);
        setUser(response.user);
        localStorage.setItem('token', response.accessToken);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response.user;
      } catch (err: any) {
        const message = err.response?.data?.error || 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setToken, setUser]
  );

  const logout = useCallback(() => {
    storeLogout();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, [storeLogout]);

  return {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!token && !!user,
  };
}
