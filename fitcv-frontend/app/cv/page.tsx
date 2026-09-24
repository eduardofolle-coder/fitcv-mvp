'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import AppShell from '@/app/components/AppShell';

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];

function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.includes('pdf') ||
    name.endsWith('.pdf') ||
    TEXT_EXTENSIONS.some(ext => name.endsWith(ext))
  );
}

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (TEXT_EXTENSIONS.some(ext => name.endsWith(ext))) {
    return file.text();
  }

  // pdf.js se carga solo en el navegador y bajo demanda: importarlo arriba
  // rompe el render en servidor y agranda el bundle inicial.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
    );
  }

  return pages.join('\n\n');
}

export default function CVUploadPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('free');

  useEffect(() => {
    apiClient.get<{ plan: string }>('/plans/me').then(res => {
      if (res.success && res.data?.plan) setPlan(res.data.plan);
    });
  }, []);

  if (authLoading) {
    return <div className="aw-loading">Cargando...</div>;
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!isSupported(selectedFile)) {
        setError('Selecciona un archivo PDF o de texto plano (.txt, .md)');
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('El archivo debe pesar menos de 5MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) { setError('Selecciona un archivo'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const cvContent = (await extractText(file)).trim();

      if (cvContent.length < 50) {
        setError('No se pudo leer el texto del archivo. Si es un PDF escaneado (imagen), exporta uno con texto o sube una versión .txt.');
        return;
      }

      setSuccess(`Analizando "${file.name}" con IA...`);

      const response = await apiClient.post<{ profileId: string }>('/cv/upload', { cvContent });

      if (!response.success) {
        setSuccess(null);
        setError(response.error || 'No se pudo subir el CV');
        return;
      }

      setSuccess('CV analizado exitosamente. Redirigiendo...');
      const prefs = await apiClient.get<{ dailyAnalysisHour: number | null }>('/applications/preferences');
      router.push(prefs.success && prefs.data?.dailyAnalysisHour === null ? '/preferences?primera=1' : '/dashboard');
    } catch (err) {
      setSuccess(null);
      setError(err instanceof Error ? err.message : 'No se pudo subir el CV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        <h1 className="aw-h1" style={{ marginBottom:20 }}>Subir mi CV</h1>

        {error && <div className="aw-error" style={{ marginBottom:16 }}>{error}</div>}
        {success && <div className="aw-success" style={{ marginBottom:16 }}>{success}</div>}

        <div className="aw-card">
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div
              className="aw-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown"
                onChange={handleFileChange}
                style={{ display:'none' }}
              />
              <svg style={{ width:40, height:40, color:'rgba(225,165,38,.6)', margin:'0 auto 12px' }} stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-2-12l6 6m-6-6v12m0 0L20 28m8-8l-8 8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {file ? (
                <>
                  <p style={{ fontWeight:600, color:'#F4F1E9' }}>{file.name}</p>
                  <p className="aw-dim">{(file.size / 1024).toFixed(2)} KB</p>
                  <p className="aw-dim" style={{ marginTop:4 }}>Click para cambiar archivo</p>
                </>
              ) : (
                <>
                  <p style={{ fontWeight:600, color:'#F4F1E9' }}>Click para subir tu CV</p>
                  <p className="aw-muted">o arrastra y suelta</p>
                  <p className="aw-dim" style={{ marginTop:4 }}>PDF o .txt, hasta 5MB</p>
                </>
              )}
            </div>

            <button type="submit" disabled={loading || !file} className="aw-btn-gold" style={{ width:'100%', justifyContent:'center' }}>
              {loading ? 'Subiendo...' : 'Subir y analizar'}
            </button>

            <button type="button" onClick={() => router.push('/dashboard')} className="aw-btn-outline" style={{ width:'100%', justifyContent:'center' }}>
              Volver al tablero
            </button>
          </form>

          <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid rgba(255,255,255,.08)' }}>
            <p style={{ fontSize:13, fontWeight:600, color:'#A9B6C8', marginBottom:8 }}>¿Qué pasa después?</p>
            <ol style={{ fontSize:13, color:'#6C7686', display:'flex', flexDirection:'column', gap:4, paddingLeft:16 }}>
              <li>1. La IA extrae tus habilidades y experiencia</li>
              <li>2. Se construye tu perfil automáticamente</li>
              <li>3. Ves las ofertas más afines a tu CV</li>
              {plan === 'free' ? (
                <li style={{ color:'#A9B6C8' }}>
                  4. Postulás con tu CV original —{' '}
                  <a href="/upgrade" style={{ color:'#E1A526', textDecoration:'underline' }}>
                    la adaptación automática es función Pro
                  </a>
                </li>
              ) : (
                <li>4. El CV se adapta automáticamente a cada oferta</li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
