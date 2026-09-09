import { useState, useEffect } from 'react';
import { useAPI } from './useAPI';

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFetch<T>(url: string): UseFetchState<T> {
  const api = useAPI();
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setState({ data: null, loading: true, error: null });
        const response = await api.get<{ data: T }>(url);
        if (!cancelled) {
          setState({ data: response.data.data, loading: false, error: null });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err.message || 'Error fetching data'
          });
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [url, api]);

  return state;
}
