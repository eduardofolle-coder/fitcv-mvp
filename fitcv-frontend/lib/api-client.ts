import { ApiResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('accessToken', token);
  }

  private clearToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_URL}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(typeof options.headers === 'object' ? (options.headers as Record<string, string>) : {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Un 401 en los endpoints de auth es un intento fallido y su mensaje
        // debe llegar al formulario; redirigir aquí recargaría la página y
        // borraría el error antes de que el usuario pueda leerlo.
        const isAuthAttempt =
          endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register');

        if (response.status === 401 && !isAuthAttempt) {
          this.clearToken();
          window.location.href = '/login';
        }
        return {
          success: false,
          error: data.error || 'Unknown error',
        };
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        error: message,
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  setAuthToken(token: string): void {
    this.setToken(token);
  }

  getAuthToken(): string | null {
    return this.getToken();
  }

  logout(): void {
    this.clearToken();
  }
}

export const apiClient = new ApiClient();
