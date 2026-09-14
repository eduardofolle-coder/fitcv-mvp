'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { ApplyPanel } from './ApplyPanel';

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

type ResolutionStatus = 'filled' | 'needs-approval' | 'needs-user' | 'use-adapted-cv' | 'needs-generation';

interface Resolution {
  fieldId: string;
  category: string;
  status: ResolutionStatus;
  value?: string;
  source?: string;
  reason?: string;
  suggestion?: string;
}

const STATUS_STYLE: Record<ResolutionStatus, { label: string; className: string }> = {
  filled: { label: 'Se responde sola', className: 'bg-green-100 text-green-800' },
  'needs-approval': { label: 'Borrador: revísalo', className: 'bg-yellow-100 text-yellow-800' },
  'needs-user': { label: 'Te toca a ti', className: 'bg-gray-100 text-gray-800' },
  'use-adapted-cv': { label: 'Sube el CV adaptado', className: 'bg-indigo-100 text-indigo-800' },
  'needs-generation': { label: 'Pendiente', className: 'bg-gray-100 text-gray-800' },
};

const scoreColor = (score: number) =>
  score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';

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
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  if (!user) return null;

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
          <p className="text-red-700 mb-4">{loadError || 'Postulación no encontrada'}</p>
          <button onClick={() => router.push('/postulations')} className="text-blue-600 hover:underline">
            Volver a mis postulaciones
          </button>
        </div>
      </div>
    );
  }

  const keywordMatches = cv?.narrative?.keywordMatches ?? [];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div>
          <button onClick={() => router.push('/postulations')} className="text-sm text-blue-600 hover:underline mb-3">
            ← Mis postulaciones
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{detail.title}</h1>
          <p className="text-gray-600">
            {detail.company}
            {detail.level ? ` · ${detail.level}` : ''} · {detail.estado}
          </p>
        </div>

        {loadError && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{loadError}</p>
          </div>
        )}

        {/* CV adaptado */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h2 className="text-xl font-bold text-gray-900">CV adaptado a esta oferta</h2>
              <p className="text-sm text-gray-600">
                Empresas, cargos, fechas y estudios se copian tal cual de tu CV. Solo el titular, el resumen y la
                redacción de tus logros se orientan a la oferta, y se verifica que no digan más de lo que dice tu CV.
              </p>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? 'Adaptando...' : cv ? 'Volver a adaptar' : 'Adaptar mi CV'}
            </button>
          </div>

          {generating && (
            <div className="rounded-md bg-blue-50 p-4 mt-4">
              <p className="text-sm text-blue-800">
                Adaptando tu CV y verificando cada afirmación contra el original. Suele tardar entre 30 y 60 segundos.
              </p>
            </div>
          )}

          {needsReupload && (
            <div className="rounded-md bg-yellow-50 p-4 mt-4">
              <p className="text-sm text-yellow-800 mb-2">
                Tu CV se analizó con una versión anterior de FITCV que no guardaba tu historial laboral por separado.
                Súbelo de nuevo para poder adaptarlo.
              </p>
              <button onClick={() => router.push('/cv')} className="text-sm font-medium text-yellow-900 underline">
                Subir mi CV
              </button>
            </div>
          )}

          {generateError && (
            <div className="rounded-md bg-red-50 p-4 mt-4">
              <p className="text-sm font-medium text-red-800">{generateError}</p>
            </div>
          )}

          {!cv && !generating && !needsReupload && (
            <p className="text-gray-500 mt-4">Todavía no has adaptado tu CV para esta oferta.</p>
          )}

          {cv && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-600">Puntaje ATS estimado</p>
                  <p className={`text-3xl font-bold ${cv.atsScore === null ? 'text-gray-400' : scoreColor(cv.atsScore)}`}>
                    {cv.atsScore === null ? '—' : cv.atsScore}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 md:col-span-2">
                  <p className="text-sm text-gray-600 mb-2">Palabras clave de la oferta que ya están en tu CV</p>
                  {keywordMatches.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {keywordMatches.map(k => (
                        <span key={k} className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-full text-sm">
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Ninguna detectada.</p>
                  )}
                </div>
              </div>

              {cv.narrative?.rationale && (
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-1">
                    Consejo para ti (no aparece en el CV)
                  </p>
                  <p className="text-sm text-indigo-900">{cv.narrative.rationale}</p>
                </div>
              )}

              {cv.changes.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-yellow-800 mb-2">
                    Lo que FITCV corrigió para no exagerar
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {cv.changes.map((change, i) => (
                      <li key={i} className="text-sm text-yellow-900">
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">
                    Tu CV{cv.narrative?.language === 'en' ? ' (en inglés)' : ''}
                  </p>
                  <button
                    onClick={() => flashCopied('cv', cv.content)}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                  >
                    {copied === 'cv' ? 'Copiado' : 'Copiar texto'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg p-5 overflow-x-auto">
                  {cv.content}
                </pre>
              </div>
            </div>
          )}
        </section>

        <ApplyPanel postulationId={detail.id} hasCv={Boolean(cv)} />

        {/* Preguntas del formulario */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Preguntas del formulario</h2>
          <p className="text-sm text-gray-600 mb-4">
            Pega las preguntas de la postulación, una por línea. FITCV responde solo lo que tu CV respalda; las
            decisiones personales, como la renta, las decides tú.
          </p>

          <textarea
            value={questions}
            onChange={e => setQuestions(e.target.value)}
            rows={5}
            placeholder={'¿Tienes experiencia en AWS?\nPretensión de renta líquida\nDescribe un proyecto del que te sientas orgulloso'}
            className="w-full rounded-md border border-gray-300 p-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={resolve}
              disabled={resolving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {resolving ? 'Respondiendo...' : 'Responder con mi CV'}
            </button>
            {resolving && <p className="text-sm text-gray-600">Redactando y verificando, puede tardar hasta un minuto.</p>}
          </div>

          {resolveError && (
            <div className="rounded-md bg-red-50 p-4 mt-4">
              <p className="text-sm font-medium text-red-800">{resolveError}</p>
            </div>
          )}

          {resolutions.length > 0 && (
            <ul className="mt-6 space-y-4">
              {resolutions.map(r => {
                const style = STATUS_STYLE[r.status];
                return (
                  <li key={r.fieldId} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-gray-900">{asked[r.fieldId] ?? r.fieldId}</p>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${style.className}`}>
                        {style.label}
                      </span>
                    </div>

                    {r.status === 'filled' && (
                      <>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{r.value}</p>
                        {r.source && <p className="text-xs text-gray-500 mt-1">{r.source}</p>}
                      </>
                    )}

                    {r.status === 'needs-approval' && (
                      <>
                        {r.reason && <p className="text-sm text-yellow-800 mb-2">{r.reason}</p>}
                        <textarea
                          value={drafts[r.fieldId] ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [r.fieldId]: e.target.value }))}
                          rows={4}
                          className="w-full rounded-md border border-gray-300 p-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          onClick={() => flashCopied(r.fieldId, drafts[r.fieldId] ?? '')}
                          className="mt-2 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                        >
                          {copied === r.fieldId ? 'Copiado' : 'Copiar'}
                        </button>
                      </>
                    )}

                    {r.status === 'needs-user' && (
                      <>
                        {r.reason && <p className="text-sm text-gray-700">{r.reason}</p>}
                        {r.suggestion && <p className="text-xs text-gray-500 mt-1">Sugerencia: {r.suggestion}</p>}
                      </>
                    )}

                    {r.status === 'use-adapted-cv' && (
                      <p className="text-sm text-gray-700">Usa el CV adaptado de esta página.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
