'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../api-client';
import { AuthUser, LoginRequest, RegisterRequest, AuthResponse } from '../types';

export type AuthResult = { ok: boolean; error?: string };

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

  // Devuelve el mensaje de error además de setearlo: el estado `error` no está
  // disponible para quien llama hasta el siguiente render.
  const submitCredentials = async (
    endpoint: '/auth/login' | '/auth/register',
    credentials: LoginRequest | RegisterRequest,
    fallbackMessage: string
  ): Promise<AuthResult> => {
    setLoading(true);
    setError(null);

    const response = await apiClient.post<AuthResponse['data']>(
      endpoint,
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
      return { ok: true };
    }

    const message = response.error || fallbackMessage;
    setError(message);
    setLoading(false);
    return { ok: false, error: message };
  };

  const login = (credentials: LoginRequest): Promise<AuthResult> =>
    submitCredentials('/auth/login', credentials, 'Login failed');

  const register = (credentials: RegisterRequest): Promise<AuthResult> =>
    submitCredentials('/auth/register', credentials, 'Registration failed');

  const logout = (): void => {
    apiClient.logout();
    setUser(null);
  };

  return { user, loading, error, login, register, logout };
}
