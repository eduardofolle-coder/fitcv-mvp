'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { ApplyPanel } from './ApplyPanel';
import AppShell from '@/app/components/AppShell';

interface PostulationDetail {
  id: string;
  title: string;
  company: string;
  level?: string;
  description?: string;
  requirements: string[];
  estado: string;
  cvAdaptedId: string | null;
}

// Lo que devuelve GET /api/postulations/:id/cv.
interface AdaptedCv {
  content: string;
  atsScore: number | null;
  changes: string[];
  narrative: {
    headline?: string;
    summary?: string;
    rationale?: string;
    language?: 'es' | 'en';
    keywordMatches?: string[];
  } | null;
  job: string;
}

type ResolutionStatus = 'filled' | 'needs-approval' | 'needs-user' | 'use-adapted-cv' | 'needs-generation' | 'leave-blank';

interface Resolution {
  fieldId: string;
  category: string;
  status: ResolutionStatus;
  value?: string;
  source?: string;
  reason?: string;
  suggestion?: string;
}

const STATUS_STYLE: Record<ResolutionStatus, { label: string; bg: string; color: string }> = {
  filled:            { label: 'Se responde sola',    bg: 'rgba(52,211,153,.18)',  color: '#6EE7B7' },
  'needs-approval':  { label: 'Borrador: revísalo',  bg: 'rgba(225,165,38,.18)',  color: '#E1A526' },
  'needs-user':      { label: 'Te toca a ti',        bg: 'rgba(169,182,200,.15)', color: '#A9B6C8' },
  'use-adapted-cv':  { label: 'Sube el CV adaptado', bg: 'rgba(99,179,237,.18)',  color: '#90CDF4' },
  'needs-generation':{ label: 'Pendiente',           bg: 'rgba(169,182,200,.15)', color: '#A9B6C8' },
  'leave-blank':     { label: 'Se deja sin marcar',  bg: 'rgba(108,118,134,.15)', color: '#6C7686' },
};

const scoreColor = (score: number): string =>
  score >= 75 ? '#6EE7B7' : score >= 50 ? '#E1A526' : '#FCA5A5';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function PostulationDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, initializing } = useAuth();

  const [detail, setDetail] = useState<PostulationDetail | null>(null);
  const [cv, setCv] = useState<AdaptedCv | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [needsReupload, setNeedsReupload] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [questions, setQuestions] = useState('');
  const [asked, setAsked] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const loadCv = useCallback(async () => {
    const res = await apiClient.get<AdaptedCv>(`/postulations/${id}/cv`);
    if (res.success && res.data) setCv(res.data);
    return res;
  }, [id]);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  useEffect(() => {
    if (initializing || !user || !id) return;

    let cancelled = false;
    (async () => {
      const res = await apiClient.get<PostulationDetail>(`/postulations/${id}`);
      if (cancelled) return;

      if (!res.success || !res.data) {
        setLoadError(res.error || 'No se pudo cargar la postulación');
        setLoading(false);
        return;
      }
      setDetail(res.data);

      // Sin CV adaptado todavía no hay nada que pedir: el 404 sería el estado normal.
      if (res.data.cvAdaptedId) {
        const cvRes = await loadCv();
        if (cancelled) return;
        if (!cvRes.success) setLoadError(cvRes.error || 'No se pudo cargar el CV adaptado');
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [initializing, user, id, loadCv]);

  const flashCopied = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(current => (current === key ? null : current)), 2000);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setNeedsReupload(false);

    const res = await apiClient.post(`/postulations/${id}/generate-cv`);
    if (!res.success) {
      // Perfil analizado antes de guardar el historial estructurado (409).
      if (res.error?.includes('upload it again')) setNeedsReupload(true);
      else setGenerateError(res.error || 'No se pudo adaptar el CV');
      setGenerating(false);
      return;
    }

    const cvRes = await loadCv();
    if (!cvRes.success) setGenerateError(cvRes.error || 'El CV se adaptó, pero no se pudo cargar');
    setGenerating(false);
  };

  const resolve = async () => {
    const labels = questions
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (labels.length === 0) {
      setResolveError('Pega al menos una pregunta, una por línea.');
      return;
    }

    const fields = labels.map((label, i) => ({ id: `q${i}`, label }));
    setAsked(Object.fromEntries(fields.map(f => [f.id, f.label])));
    setResolving(true);
    setResolveError(null);
    setResolutions([]);

    const res = await apiClient.post<{ resolutions: Resolution[] }>('/applications/resolve-fields', {
      fields,
      job: detail ? { title: detail.title, company: detail.company, description: detail.description ?? '' } : undefined,
    });

    if (!res.success || !res.data) {
      setResolveError(
        res.error?.includes('upload it again')
          ? 'Tu CV se analizó con una versión anterior de FITCV. Súbelo de nuevo para responder preguntas.'
          : res.error || 'No se pudieron resolver las preguntas'
      );
    } else {
      setResolutions(res.data.resolutions);
      setDrafts(
        Object.fromEntries(
          res.data.resolutions.filter(r => r.status === 'needs-approval').map(r => [r.fieldId, r.value ?? ''])
        )
      );
    }
    setResolving(false);
  };

  if (initializing || (user && loading)) {
    return <div className="aw-loading">Cargando...</div>;
  }

  if (!user) return null;

  if (!detail) {
    return (
      <AppShell>
        <div className="aw-card" style={{ maxWidth:640, margin:'0 auto', textAlign:'center' }}>
          <p className="aw-error" style={{ marginBottom:16 }}>{loadError || 'Postulación no encontrada'}</p>
          <button onClick={() => router.push('/postulations')} className="aw-btn-outline">
            Volver a mis postulaciones
          </button>
        </div>
      </AppShell>
    );
  }

  const keywordMatches = cv?.narrative?.keywordMatches ?? [];

  return (
    <AppShell>
      <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
        <div>
          <button onClick={() => router.push('/postulations')} className="aw-btn-outline aw-btn-sm" style={{ marginBottom:12 }}>
            ← Mis postulaciones
          </button>
          <h1 className="aw-h1">{detail.title}</h1>
          <p className="aw-muted">
            {detail.company}{detail.level ? ` · ${detail.level}` : ''} · {detail.estado}
          </p>
        </div>

        {loadError && <div className="aw-error">{loadError}</div>}

        {/* CV adaptado */}
        <section className="aw-card">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:12 }}>
            <div>
              <h2 className="aw-h2" style={{ margin:0 }}>CV adaptado a esta oferta</h2>
              <p className="aw-muted" style={{ marginTop:4 }}>
                Empresas, cargos, fechas y estudios se copian tal cual de tu CV. Solo el titular, el resumen y la
                redacción de tus logros se orientan a la oferta, y se verifica que no digan más de lo que dice tu CV.
              </p>
            </div>
            <button onClick={generate} disabled={generating} className="aw-btn-gold aw-btn-sm" style={{ flexShrink:0 }}>
              {generating ? 'Adaptando...' : cv ? 'Volver a adaptar' : 'Adaptar mi CV'}
            </button>
          </div>

          {generating && <div className="aw-info" style={{ marginTop:12 }}>Adaptando tu CV y verificando cada afirmación contra el original. Suele tardar entre 30 y 60 segundos.</div>}
          {needsReupload && (
            <div className="aw-warning" style={{ marginTop:12 }}>
              Tu CV se analizó con una versión anterior de FITCV que no guardaba tu historial laboral por separado.
              Súbelo de nuevo para poder adaptarlo.{' '}
              <button onClick={() => router.push('/cv')} style={{ color:'#E1A526', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0, textDecoration:'underline' }}>Subir mi CV</button>
            </div>
          )}
          {generateError && <div className="aw-error" style={{ marginTop:12 }}>{generateError}</div>}
          {!cv && !generating && !needsReupload && <p className="aw-muted" style={{ marginTop:12 }}>Todavía no has adaptado tu CV para esta oferta.</p>}

          {cv && (
            <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:16 }}>
              <div className="aw-grid-3">
                <div className="aw-stat">
                  <p className="aw-dim">Puntaje ATS estimado</p>
                  <p style={{ fontSize:32, fontWeight:700, color: cv.atsScore === null ? '#6C7686' : scoreColor(cv.atsScore) }}>
                    {cv.atsScore === null ? '—' : cv.atsScore}
                  </p>
                </div>
                <div className="aw-stat" style={{ gridColumn:'span 2' }}>
                  <p className="aw-dim" style={{ marginBottom:8 }}>Palabras clave de la oferta ya en tu CV</p>
                  {keywordMatches.length > 0 ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {keywordMatches.map(k => <span key={k} className="aw-pill aw-pill-blue">{k}</span>)}
                    </div>
                  ) : (
                    <p className="aw-dim">Ninguna detectada.</p>
                  )}
                </div>
              </div>

              {cv.narrative?.rationale && (
                <div className="aw-info">
                  <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Consejo para ti (no aparece en el CV)</p>
                  <p style={{ fontSize:14 }}>{cv.narrative.rationale}</p>
                </div>
              )}

              {cv.changes.length > 0 && (
                <div className="aw-warning">
                  <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Lo que FITCV corrigió para no exagerar</p>
                  <ul style={{ paddingLeft:16, display:'flex', flexDirection:'column', gap:4 }}>
                    {cv.changes.map((change, i) => <li key={i} style={{ fontSize:14 }}>{change}</li>)}
                  </ul>
                </div>
              )}

              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <p style={{ fontWeight:600, color:'#A9B6C8', fontSize:13 }}>Tu CV{cv.narrative?.language === 'en' ? ' (en inglés)' : ''}</p>
                  <button onClick={() => flashCopied('cv', cv.content)} className="aw-btn-outline aw-btn-sm">
                    {copied === 'cv' ? 'Copiado' : 'Copiar texto'}
                  </button>
                </div>
                <pre className="aw-pre">{cv.content}</pre>
              </div>
            </div>
          )}
        </section>

        <ApplyPanel postulationId={detail.id} hasCv={Boolean(cv)} />

        {/* Preguntas del formulario */}
        <section className="aw-card">
          <h2 className="aw-h2">Preguntas del formulario</h2>
          <p className="aw-muted" style={{ marginBottom:14 }}>
            Pega las preguntas de la postulación, una por línea. FITCV responde solo lo que tu CV respalda; las
            decisiones personales, como la renta, las decides tú.
          </p>

          <textarea
            value={questions}
            onChange={e => setQuestions(e.target.value)}
            rows={5}
            placeholder={'¿Tienes experiencia en AWS?\nPretensión de renta líquida\nDescribe un proyecto del que te sientas orgulloso'}
            className="aw-input"
            style={{ resize:'vertical' }}
          />

          <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={resolve} disabled={resolving} className="aw-btn-gold aw-btn-sm">
              {resolving ? 'Respondiendo...' : 'Responder con mi CV'}
            </button>
            {resolving && <p className="aw-dim">Redactando y verificando, puede tardar hasta un minuto.</p>}
          </div>

          {resolveError && <div className="aw-error" style={{ marginTop:12 }}>{resolveError}</div>}

          {resolutions.length > 0 && (
            <ul style={{ marginTop:20, display:'flex', flexDirection:'column', gap:12, listStyle:'none', padding:0 }}>
              {resolutions.map(r => {
                const style = STATUS_STYLE[r.status];
                return (
                  <li key={r.fieldId} className="aw-card aw-card-sm">
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                      <p style={{ fontWeight:600, color:'#F4F1E9' }}>{asked[r.fieldId] ?? r.fieldId}</p>
                      <span className="aw-pill" style={{ background:style.bg, color:style.color, flexShrink:0 }}>{style.label}</span>
                    </div>

                    {r.status === 'filled' && (
                      <>
                        <p style={{ fontSize:14, color:'#F4F1E9', whiteSpace:'pre-wrap' }}>{r.value}</p>
                        {r.source && <p className="aw-dim" style={{ marginTop:4 }}>{r.source}</p>}
                      </>
                    )}

                    {r.status === 'needs-approval' && (
                      <>
                        {r.reason && <p className="aw-muted" style={{ marginBottom:8 }}>{r.reason}</p>}
                        <textarea
                          value={drafts[r.fieldId] ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [r.fieldId]: e.target.value }))}
                          rows={4}
                          className="aw-input"
                          style={{ resize:'vertical' }}
                        />
                        <button onClick={() => flashCopied(r.fieldId, drafts[r.fieldId] ?? '')} className="aw-btn-outline aw-btn-sm" style={{ marginTop:8 }}>
                          {copied === r.fieldId ? 'Copiado' : 'Copiar'}
                        </button>
                      </>
                    )}

                    {r.status === 'needs-user' && (
                      <>
                        {r.reason && <p className="aw-muted">{r.reason}</p>}
                        {r.suggestion && <p className="aw-dim" style={{ marginTop:4 }}>Sugerencia: {r.suggestion}</p>}
                      </>
                    )}

                    {r.status === 'use-adapted-cv' && (
                      <p className="aw-muted">Usa el CV adaptado de esta página.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
