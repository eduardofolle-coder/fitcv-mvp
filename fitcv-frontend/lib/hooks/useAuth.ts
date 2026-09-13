'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../api-client';
import { AuthUser, LoginRequest, RegisterRequest, AuthResponse } from '../types';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = apiClient.getAuthToken();
    if (token) {
      setUser({ id: '', email: '', accessToken: token });
    }
    setLoading(false);
  }, []);

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const response = await apiClient.post<AuthResponse['data']>(
      '/auth/login',
      credentials
    );

    if (response.success && response.data) {
      apiClient.setAuthToken(response.data.accessToken);
      setUser({
        id: response.data.userId,
        email: response.data.email,
        accessToken: response.data.accessToken,
      });
      setLoading(false);
      return true;
    }

    setError(response.error || 'Login failed');
    setLoading(false);
    return false;
  };

  const register = async (credentials: RegisterRequest): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const response = await apiClient.post<AuthResponse['data']>(
      '/auth/register',
      credentials
    );

    if (response.success && response.data) {
      apiClient.setAuthToken(response.data.accessToken);
      setUser({
        id: response.data.userId,
        email: response.data.email,
        accessToken: response.data.accessToken,
      });
      setLoading(false);
      return true;
    }

    setError(response.error || 'Registration failed');
    setLoading(false);
    return false;
  };

  const logout = (): void => {
    apiClient.logout();
    setUser(null);
  };

  return { user, loading, error, login, register, logout };
}
