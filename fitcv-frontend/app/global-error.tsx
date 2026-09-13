'use client';

/**
 * Último recurso: un error dentro del layout raíz no lo atrapa app/error.tsx,
 * así que este boundary tiene que renderizar su propio <html>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f9fafb',
          color: '#111827',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>
            FITCV no pudo cargar
          </h1>
          <p style={{ color: '#4b5563', marginBottom: 24 }}>
            Ocurrió un error al iniciar la aplicación. Reintenta en un momento.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
