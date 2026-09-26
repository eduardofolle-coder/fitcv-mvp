'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import AppShell from '@/app/components/AppShell';

type Status = 'conectado' | 'desconectado' | 'sin-verificar';
interface Portal { id: string; name: string; connectUrl: string; signupUrl: string; verifiable: boolean; status: Status; checkedAt: string | null }

const PILL: Record<Status, [string, string]> = {
  conectado: ['aw-pill aw-pill-green', 'Conectado'],
  desconectado: ['aw-pill aw-pill-red', 'Sin sesión'],
  'sin-verificar': ['aw-pill aw-pill-gray', 'Sin verificar'],
};

/** Conecta tus portales: el candidato inicia sesión una vez en cada uno, en su navegador. */
export default function PortalesPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const [portals, setPortals] = useState<Portal[]>([]);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const res = await apiClient.get<Portal[]>('/extension/portals');
      if (res.success) setPortals(res.data ?? []);
    };
    void load();
    // La extensión verifica sola apenas el candidato inicia sesión: se refresca para verlo.
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [user]);

  if (initializing || !user) return <div className="aw-loading">Cargando...</div>;

  const confirm = async (id: string) => {
    const res = await apiClient.post<Portal[]>(`/extension/portals/${id}/connected`, {});
    if (res.success) setPortals(res.data ?? []);
  };

  const connected = portals.filter((p) => p.status === 'conectado').length;

  return (
    <AppShell>
      <h1 className="aw-h1">Mis portales</h1>

      <section className="aw-card" style={{ marginBottom: 24 }}>
        <p style={{ color: '#F4F1E9', marginBottom: 8 }}>
          Para postular por ti, FITCV usa tu propia sesión en cada portal. Inicia sesión una sola vez en cada uno, en este mismo
          navegador (donde tienes la extensión), y FITCV sigue solo.
        </p>
        <p className="aw-muted" style={{ marginBottom: 8 }}>
          FITCV nunca te pide ni guarda tus contraseñas. Mientras un portal esté sin sesión, tus postulaciones ahí quedan en espera
          (no se pierden) y te avisamos para que lo conectes.
        </p>
        <p className="aw-muted">
          ¿No tienes cuenta en ninguno? Igual puedes empezar: las ofertas que piden el CV por correo se envían desde tu correo, sin
          cuenta en ningún portal.
        </p>
      </section>

      <section className="aw-card">
        <h2 className="aw-h2">{connected} de {portals.length} conectados</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {portals.map((p) => {
            const [pillClass, label] = PILL[p.status];
            return (
              <div
                key={p.id}
                style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}
              >
                <span style={{ color: '#F4F1E9', flex: 1, minWidth: 160 }}>{p.name}</span>
                <span className={pillClass}>{label}</span>
                {p.status !== 'conectado' && (
                  <>
                    <a className="aw-btn-gold aw-btn-sm" href={p.connectUrl} target="_blank" rel="noopener noreferrer">Iniciar sesión</a>
                    <a className="aw-btn-outline aw-btn-sm" href={p.signupUrl} target="_blank" rel="noopener noreferrer">Crear cuenta</a>
                    {!p.verifiable && (
                      <button className="aw-btn-outline aw-btn-sm" onClick={() => confirm(p.id)}>Ya inicié sesión</button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="aw-dim" style={{ marginTop: 12, fontSize: 13 }}>
          Los portales con "Ya inicié sesión" no permiten verificarlo solo: si al postular pide login, FITCV te vuelve a avisar.
        </p>
      </section>
    </AppShell>
  );
}
