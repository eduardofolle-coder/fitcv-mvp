'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../api-client';
import { AuthUser, LoginRequest, RegisterRequest, AuthResponse } from '../types';

export type AuthResult = { ok: boolean; error?: string };

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Dos esperas distintas: `initializing` es la lectura del token al montar,
  // que usan los guards de ruta; `submitting` es el envío del formulario.
  // Compartían un mismo flag, así que el botón de registro aparecía como
  // "Creating account..." y deshabilitado antes de que el usuario tocara nada.
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = apiClient.getAuthToken();
    if (token) {
      setUser({ id: '', email: '', accessToken: token });
    }
    setInitializing(false);
  }, []);

  // Devuelve el mensaje de error además de setearlo: el estado `error` no está
  // disponible para quien llama hasta el siguiente render.
  const submitCredentials = async (
    endpoint: '/auth/login' | '/auth/register',
    credentials: LoginRequest | RegisterRequest,
    fallbackMessage: string
  ): Promise<AuthResult> => {
    setSubmitting(true);
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
      setSubmitting(false);
      return { ok: true };
    }

    const message = response.error || fallbackMessage;
    setError(message);
    setSubmitting(false);
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

  // `loading` se mantiene como alias de `initializing` para los guards.
  return { user, initializing, submitting, loading: initializing, error, login, register, logout };
}
