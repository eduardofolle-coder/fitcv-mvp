'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { NATIONALITIES, REGIONES, comunasByRegion } from '@/lib/chile';
import AppShell from '@/app/components/AppShell';

// Lo que devuelve y acepta /api/applications/preferences.
interface Preferences {
  autoSendLinkedIn: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  availability: string | null;
  rut: string | null;
  address: string | null;
  comuna: string | null;
  region: string | null;
  nationality: string | null;
  driverLicense: string | null;
  willingToTravel: boolean | null;
  shiftWork: boolean | null;
  relocation: boolean | null;
  workPermit: boolean | null;
  acceptPortalTerms: boolean;
  acceptPortalTermsAt: string | null;
  dailyAnalysisHour: number | null;
}

type YesNo = '' | 'si' | 'no';

const AVAILABILITY = ['Inmediata', '15 días', '30 días', 'Más de 30 días'];
const LICENSES = ['No tengo', 'Clase B', 'Clase A1', 'Clase A2', 'Clase A3', 'Clase A4', 'Clase A5', 'Clase C', 'Clase D'];

const toYesNo = (value: boolean | null): YesNo => (value === null ? '' : value ? 'si' : 'no');
const fromYesNo = (value: YesNo): boolean | null => (value === '' ? null : value === 'si');

// "1.800.000" o "1800000" -> 1800000. Vacío -> null.
const parseMoney = (value: string): number | null => {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
};
const formatMoney = (value: number | null): string => (value === null ? '' : value.toLocaleString('es-CL'));

export default function PreferencesPage() {
  const router = useRouter();
  const { user, initializing } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [availability, setAvailability] = useState('');
  const [rut, setRut] = useState('');
  const [address, setAddress] = useState('');
  const [comuna, setComuna] = useState('');
  const [region, setRegion] = useState('');
  const [nationality, setNationality] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [willingToTravel, setWillingToTravel] = useState<YesNo>('');
  const [shiftWork, setShiftWork] = useState<YesNo>('');
  const [relocation, setRelocation] = useState<YesNo>('');
  const [workPermit, setWorkPermit] = useState<YesNo>('');
  const [acceptPortalTerms, setAcceptPortalTerms] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [analysisHour, setAnalysisHour] = useState('');
  // Llega desde la subida del CV, cuando todavía no eligió la hora del análisis.
  const [firstTime, setFirstTime] = useState(false);

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  useEffect(() => {
    if (initializing || !user) return;
    let cancelled = false;
    (async () => {
      setFirstTime(new URLSearchParams(window.location.search).has('primera'));
      const res = await apiClient.get<Preferences>('/applications/preferences');
      if (cancelled) return;
      if (res.success && res.data) {
        const p = res.data;
        setSalaryMin(formatMoney(p.salaryMin));
        setSalaryMax(formatMoney(p.salaryMax));
        setAvailability(p.availability ?? '');
        setRut(p.rut ?? '');
        setAddress(p.address ?? '');
        setComuna(p.comuna ?? '');
        setRegion(p.region ?? '');
        setNationality(p.nationality ?? '');
        setDriverLicense(p.driverLicense ?? '');
        setWillingToTravel(toYesNo(p.willingToTravel));
        setShiftWork(toYesNo(p.shiftWork));
        setRelocation(toYesNo(p.relocation));
        setWorkPermit(toYesNo(p.workPermit));
        setAcceptPortalTerms(p.acceptPortalTerms);
        setAcceptedAt(p.acceptPortalTermsAt);
        setAnalysisHour(p.dailyAnalysisHour === null ? '' : String(p.dailyAnalysisHour));
      } else {
        setError(res.error || 'No se pudieron cargar tus respuestas');
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initializing, user]);

  if (initializing || !loaded) {
    return <div className="aw-loading">Cargando...</div>;
  }
  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const min = parseMoney(salaryMin);
    const max = parseMoney(salaryMax);
    if (min !== null && max !== null && min > max) {
      setError('El "desde" de tu renta no puede ser mayor que el "hasta".');
      setSaving(false);
      return;
    }

    const res = await apiClient.put<Preferences>('/applications/preferences', {
      salaryMin: min,
      salaryMax: max,
      availability: availability || null,
      rut: rut.trim() || null,
      address: address.trim() || null,
      comuna: comuna.trim() || null,
      region: region.trim() || null,
      nationality: nationality.trim() || null,
      driverLicense: driverLicense || null,
      willingToTravel: fromYesNo(willingToTravel),
      shiftWork: fromYesNo(shiftWork),
      relocation: fromYesNo(relocation),
      workPermit: fromYesNo(workPermit),
      acceptPortalTerms,
      dailyAnalysisHour: analysisHour === '' ? null : Number(analysisHour),
    });

    if (res.success && res.data) {
      setAcceptedAt(res.data.acceptPortalTermsAt);
      setMessage('Guardado. FITCV usará estas respuestas en tus próximas postulaciones.');
    } else {
      setError(res.error || 'No se pudieron guardar tus respuestas');
    }
    setSaving(false);
  };

  const yesNo = (id: string, text: string, value: YesNo, onChange: (v: YesNo) => void) => (
    <div>
      <label htmlFor={id} className="aw-label">{text}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as YesNo)} className="aw-select">
        <option value="">Preguntarme cada vez</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
  );

  const sectionStyle = { marginBottom: 16 };
  const gridStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 } as const;

  return (
    <AppShell>
      <h1 className="aw-h1" style={{ marginBottom:4 }}>Mis respuestas frecuentes</h1>
      <p className="aw-muted" style={{ marginBottom:20 }}>
        Lo que respondes aquí una vez, FITCV lo usa en todos los formularios de postulación. Lo que dejes en blanco se
        te preguntará en cada postulación.
      </p>

      {firstTime && (
        <div className="aw-info" style={{ marginBottom:20 }}>
          Tu CV quedó analizado. Ahora elige a qué hora quieres que FITCV revise cada día las ofertas de tu perfil y
          completa tus respuestas frecuentes.
        </div>
      )}

      <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <section className="aw-card" style={sectionStyle}>
          <h2 className="aw-h2">Análisis diario de ofertas</h2>
          <p className="aw-muted" style={{ marginBottom:12 }}>
            Cada día, a esta hora, FITCV revisa las ofertas de tu perfil y te avisa cuántas hay de calce alto, medio y
            bajo, destacando las nuevas.
          </p>
          <div style={{ maxWidth:240 }}>
            <label htmlFor="analysisHour" className="aw-label">Hora del análisis (hora de Chile)</label>
            <select id="analysisHour" value={analysisHour} onChange={e => setAnalysisHour(e.target.value)} className="aw-select">
              <option value="">Sin análisis diario</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        </section>

        <section className="aw-card" style={sectionStyle}>
          <h2 className="aw-h2">Pretensión de renta líquida</h2>
          <div style={{ ...gridStyle, marginBottom:12 }}>
            <div>
              <label htmlFor="salaryMin" className="aw-label">Desde ($)</label>
              <input id="salaryMin" inputMode="numeric" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} placeholder="1.800.000" className="aw-input" />
            </div>
            <div>
              <label htmlFor="salaryMax" className="aw-label">Hasta ($)</label>
              <input id="salaryMax" inputMode="numeric" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} placeholder="2.200.000" className="aw-input" />
            </div>
          </div>
          <ul className="aw-dim" style={{ paddingLeft:16, display:'flex', flexDirection:'column', gap:4 }}>
            <li>Si la oferta no dice cuánto paga, FITCV responde tu rango completo (en campos numéricos, el &quot;hasta&quot;).</li>
            <li>Si la oferta paga más que tu rango, FITCV postula y acepta el sueldo de la oferta.</li>
            <li>Si la oferta paga menos que tu &quot;desde&quot;, FITCV no postula: te pide autorización en tu tablero.</li>
          </ul>
        </section>

        <section className="aw-card" style={sectionStyle}>
          <h2 className="aw-h2">Disponibilidad y condiciones</h2>
          <div style={{ ...gridStyle }}>
            <div>
              <label htmlFor="availability" className="aw-label">Disponibilidad para empezar</label>
              <select id="availability" value={availability} onChange={e => setAvailability(e.target.value)} className="aw-select">
                <option value="">Preguntarme cada vez</option>
                {AVAILABILITY.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="driverLicense" className="aw-label">Licencia de conducir</label>
              <select id="driverLicense" value={driverLicense} onChange={e => setDriverLicense(e.target.value)} className="aw-select">
                <option value="">Preguntarme cada vez</option>
                {LICENSES.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            {yesNo('travel', '¿Disponibilidad para viajar?', willingToTravel, setWillingToTravel)}
            {yesNo('shifts', '¿Disponibilidad para turnos o fines de semana?', shiftWork, setShiftWork)}
            {yesNo('relocation', '¿Disponibilidad para cambiarte de ciudad?', relocation, setRelocation)}
            {yesNo('workPermit', '¿Tienes permiso para trabajar en Chile?', workPermit, setWorkPermit)}
          </div>
        </section>

        <section className="aw-card" style={sectionStyle}>
          <h2 className="aw-h2">Datos personales</h2>
          <p className="aw-dim" style={{ marginBottom:12 }}>Se guardan cifrados y solo se usan en los formularios de postulación.</p>
          <div style={{ ...gridStyle }}>
            <div>
              <label htmlFor="rut" className="aw-label">RUT</label>
              <input id="rut" value={rut} onChange={e => setRut(e.target.value)} placeholder="12.345.678-5" className="aw-input" />
            </div>
            <div>
              <label htmlFor="nationality" className="aw-label">Nacionalidad</label>
              <select id="nationality" value={nationality} onChange={e => setNationality(e.target.value)} className="aw-select">
                <option value="">Selecciona…</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1 / -1' }}>
              <label htmlFor="address" className="aw-label">Dirección</label>
              <input id="address" value={address} onChange={e => setAddress(e.target.value)} className="aw-input" />
            </div>
            <div>
              <label htmlFor="region" className="aw-label">Región</label>
              <select id="region" value={region} onChange={e => { setRegion(e.target.value); setComuna(''); }} className="aw-select">
                <option value="">Selecciona…</option>
                {REGIONES.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="comuna" className="aw-label">Comuna</label>
              <select id="comuna" value={comuna} onChange={e => setComuna(e.target.value)} className="aw-select" disabled={!region}>
                <option value="">{region ? 'Selecciona…' : 'Elige región primero'}</option>
                {comunasByRegion(region).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="aw-card" style={sectionStyle}>
          <h2 className="aw-h2">Términos de los portales</h2>
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:14, color:'#A9B6C8', cursor:'pointer' }}>
            <input type="checkbox" checked={acceptPortalTerms} onChange={e => setAcceptPortalTerms(e.target.checked)} style={{ marginTop:2 }} />
            <span>
              Autorizo a FITCV a marcar en mi nombre las casillas de aceptación de términos, condiciones y política de
              privacidad de los formularios de postulación. Las casillas de publicidad o novedades nunca se marcan.
            </span>
          </label>
          {acceptPortalTerms && acceptedAt && (
            <p className="aw-dim" style={{ marginTop:8 }}>Autorizado el {new Date(acceptedAt).toLocaleString()}.</p>
          )}
        </section>

        {error && <div className="aw-error">{error}</div>}
        {message && <div className="aw-success">{message}</div>}

        <button type="submit" disabled={saving} className="aw-btn-gold" style={{ alignSelf:'flex-start' }}>
          {saving ? 'Guardando...' : 'Guardar mis respuestas'}
        </button>
      </form>

      <section style={{ marginTop:32, paddingTop:24, borderTop:'1px solid rgba(255,255,255,.08)' }}>
        <p className="aw-dim" style={{ textTransform:'uppercase', letterSpacing:'.06em', fontSize:11, marginBottom:12 }}>Tus datos</p>
        <ExportDataButton />
        <DeleteAccountButton onDeleted={() => router.push('/login')} />
        <p className="aw-dim" style={{ marginTop:8 }}>
          Tus datos son eliminados permanentemente. Ver{' '}
          <a href="/privacy" style={{ color:'#6C7686', textDecoration:'underline' }}>política de privacidad</a>.
        </p>
      </section>
    </AppShell>
  );
}

// Portabilidad (Ley 21.719): el candidato se lleva todos sus datos en un archivo.
function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    const res = await apiClient.get<unknown>('/auth/me/export');
    if (res.success) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mis-datos-fitcv.json';
      a.click();
      URL.revokeObjectURL(url);
    }
    setBusy(false);
  };
  return (
    <button onClick={download} disabled={busy} style={{ display:'block', marginBottom:12, fontSize:13, color:'#A9B6C8', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0 }}>
      {busy ? 'Preparando…' : 'Descargar todos mis datos (JSON)'}
    </button>
  );
}

function DeleteAccountButton({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} style={{ fontSize:13, color:'#FCA5A5', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0 }}>
        Eliminar mi cuenta y todos mis datos
      </button>
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      <span className="aw-muted">¿Seguro? Esta acción no se puede deshacer.</span>
      <button
        onClick={async () => { setDeleting(true); await apiClient.delete('/auth/me'); onDeleted(); }}
        disabled={deleting}
        className="aw-btn-sm"
        style={{ background:'rgba(248,113,113,.2)', color:'#FCA5A5', border:'1px solid rgba(248,113,113,.4)', borderRadius:7, padding:'5px 12px', cursor:'pointer', fontSize:13, fontWeight:600 }}
      >
        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
      </button>
      <button onClick={() => setConfirming(false)} style={{ fontSize:13, color:'#6C7686', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
        Cancelar
      </button>
    </div>
  );
}
