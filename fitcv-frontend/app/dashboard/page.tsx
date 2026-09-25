'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { ExtensionCard } from './ExtensionCard';
import { DailyAnalysisCard } from './DailyAnalysisCard';
import { DiagnosisCard } from './DiagnosisCard';
import { PlanCard } from './PlanCard';
import { MailCard } from './MailCard';
import AppShell from '@/app/components/AppShell';
import { ExtensionInstallModal } from './ExtensionInstallModal';

// Lo que devuelve GET /api/cv/profile tras el análisis del CV.
interface CVProfile {
  fullName: string | null;
  yearsExperience: number | null;
  summary: string | null;
  education: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    graduationDate?: string;
  }>;
  skills: Record<string, string[]>;
  createdAt?: string;
}

const SKILL_GROUP_LABELS: Record<string, string> = {
  programming: 'Lenguajes',
  frameworks: 'Frameworks',
  tools: 'Herramientas',
  soft: 'Habilidades blandas',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showExtModal, setShowExtModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    (async () => {
      const [profileRes, tokensRes] = await Promise.all([
        apiClient.get<CVProfile>('/cv/profile'),
        apiClient.get<unknown[]>('/extension/tokens'),
      ]);
      if (cancelled) return;
      if (profileRes.success && profileRes.data) setProfile(profileRes.data);
      setProfileLoading(false);

      // Mostrar modal de instalación si: tiene CV, no tiene extensión vinculada, y no lo descartó.
      const hasTokens = tokensRes.success && Array.isArray(tokensRes.data) && tokensRes.data.length > 0;
      const dismissed = (() => { try { return !!localStorage.getItem('fitcv.extModalDismissed'); } catch { return false; } })();
      if (profileRes.success && profileRes.data && !hasTokens && !dismissed) {
        setShowExtModal(true);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  if (authLoading) {
    return <div className="aw-loading">Cargando...</div>;
  }

  if (!user) {
    return null;
  }

  const dismissExtModal = () => {
    try { localStorage.setItem('fitcv.extModalDismissed', '1'); } catch {}
    setShowExtModal(false);
  };

  return (
    <AppShell>
      {showExtModal && <ExtensionInstallModal onDismiss={dismissExtModal} />}
      {!profileLoading && (
        profile ? (
          <section className="aw-card" style={{ marginBottom: 24 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:16 }}>
              <div>
                <h2 className="aw-h2" style={{ marginBottom:2 }}>{profile.fullName || 'Tu perfil'}</h2>
                {profile.yearsExperience !== null && (
                  <p className="aw-muted">{profile.yearsExperience} años de experiencia</p>
                )}
              </div>
              <button onClick={() => router.push('/cv')} className="aw-btn-outline aw-btn-sm">
                Actualizar CV
              </button>
            </div>

            {profile.summary && (
              <p style={{ color:'#D1CCBF', fontSize:14, marginBottom:20 }}>{profile.summary}</p>
            )}

            {Object.entries(profile.skills || {})
              .filter(([, list]) => Array.isArray(list) && list.length > 0)
              .map(([group, list]) => (
                <div key={group} style={{ marginBottom:12 }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6C7686', marginBottom:8 }}>
                    {SKILL_GROUP_LABELS[group] || group}
                  </p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {list.map((skill) => (
                      <span key={skill} className="aw-pill aw-pill-blue">{skill}</span>
                    ))}
                  </div>
                </div>
              ))}

            {profile.education?.length > 0 && (
              <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid rgba(255,255,255,.08)' }}>
                <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6C7686', marginBottom:8 }}>
                  Educación
                </p>
                {profile.education.map((ed, i) => (
                  <p key={i} className="aw-muted">
                    {[ed.degree, ed.field].filter(Boolean).join(' — ')}
                    {ed.institution ? `, ${ed.institution}` : ''}
                    {ed.graduationDate ? ` (${ed.graduationDate})` : ''}
                  </p>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="aw-card" style={{ marginBottom:24, textAlign:'center' }}>
            <h2 className="aw-h2">Todavía no has subido tu CV</h2>
            <p className="aw-muted" style={{ marginBottom:16 }}>La IA lo analiza y construye tu perfil automáticamente.</p>
            <button onClick={() => router.push('/cv')} className="aw-btn-gold">
              Subir mi CV
            </button>
          </section>
        )
      )}

      <MailCard />
      <PlanCard />
      {profile && <DiagnosisCard />}
      {profile && <DailyAnalysisCard />}
      <ExtensionCard />
    </AppShell>
  );
}
