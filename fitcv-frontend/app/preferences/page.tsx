'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { apiClient } from '@/lib/api-client';

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

  useEffect(() => {
    if (!initializing && !user) router.push('/login');
  }, [initializing, user, router]);

  useEffect(() => {
    if (initializing || !user) return;
    let cancelled = false;
    (async () => {
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
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
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
    });

    if (res.success && res.data) {
      setAcceptedAt(res.data.acceptPortalTermsAt);
      setMessage('Guardado. FITCV usará estas respuestas en tus próximas postulaciones.');
    } else {
      setError(res.error || 'No se pudieron guardar tus respuestas');
    }
    setSaving(false);
  };

  const input =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
  const label = 'block text-sm font-medium text-gray-700 mb-1';

  const yesNo = (id: string, text: string, value: YesNo, onChange: (v: YesNo) => void) => (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as YesNo)} className={input}>
        <option value="">Preguntarme cada vez</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline mb-2">
          ← Tablero
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Mis respuestas frecuentes</h1>
        <p className="text-gray-600 mb-6">
          Lo que respondes aquí una vez, FITCV lo usa en todos los formularios de postulación. Lo que dejes en blanco se
          te preguntará en cada postulación.
        </p>

        <form onSubmit={save} className="space-y-6">
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Pretensión de renta líquida</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="salaryMin" className={label}>
                  Desde ($)
                </label>
                <input id="salaryMin" inputMode="numeric" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} placeholder="1.800.000" className={input} />
              </div>
              <div>
                <label htmlFor="salaryMax" className={label}>
                  Hasta ($)
                </label>
                <input id="salaryMax" inputMode="numeric" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} placeholder="2.200.000" className={input} />
              </div>
            </div>
            <ul className="text-xs text-gray-500 list-disc pl-5 space-y-1">
              <li>Si la oferta no dice cuánto paga, FITCV responde tu rango completo (en campos numéricos, el &quot;hasta&quot;).</li>
              <li>Si la oferta paga más que tu rango, FITCV postula y acepta el sueldo de la oferta.</li>
              <li>Si la oferta paga menos que tu &quot;desde&quot;, FITCV no postula: te pide autorización en tu tablero.</li>
            </ul>
          </section>

          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Disponibilidad y condiciones</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="availability" className={label}>
                  Disponibilidad para empezar
                </label>
                <select id="availability" value={availability} onChange={e => setAvailability(e.target.value)} className={input}>
                  <option value="">Preguntarme cada vez</option>
                  {AVAILABILITY.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="driverLicense" className={label}>
                  Licencia de conducir
                </label>
                <select id="driverLicense" value={driverLicense} onChange={e => setDriverLicense(e.target.value)} className={input}>
                  <option value="">Preguntarme cada vez</option>
                  {LICENSES.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {yesNo('travel', '¿Disponibilidad para viajar?', willingToTravel, setWillingToTravel)}
              {yesNo('shifts', '¿Disponibilidad para turnos o fines de semana?', shiftWork, setShiftWork)}
              {yesNo('relocation', '¿Disponibilidad para cambiarte de ciudad?', relocation, setRelocation)}
              {yesNo('workPermit', '¿Tienes permiso para trabajar en Chile?', workPermit, setWorkPermit)}
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Datos personales</h2>
            <p className="text-xs text-gray-500">Se guardan cifrados y solo se usan en los formularios de postulación.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rut" className={label}>
                  RUT
                </label>
                <input id="rut" value={rut} onChange={e => setRut(e.target.value)} placeholder="12.345.678-5" className={input} />
              </div>
              <div>
                <label htmlFor="nationality" className={label}>
                  Nacionalidad
                </label>
                <input id="nationality" value={nationality} onChange={e => setNationality(e.target.value)} placeholder="Chilena" className={input} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="address" className={label}>
                  Dirección
                </label>
                <input id="address" value={address} onChange={e => setAddress(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="comuna" className={label}>
                  Comuna
                </label>
                <input id="comuna" value={comuna} onChange={e => setComuna(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="region" className={label}>
                  Región
                </label>
                <input id="region" value={region} onChange={e => setRegion(e.target.value)} className={input} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Términos de los portales</h2>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={acceptPortalTerms}
                onChange={e => setAcceptPortalTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Autorizo a FITCV a marcar en mi nombre las casillas de aceptación de términos, condiciones y política de
                privacidad de los formularios de postulación. Las casillas de publicidad o novedades nunca se marcan.
              </span>
            </label>
            {acceptPortalTerms && acceptedAt && (
              <p className="text-xs text-gray-500">Autorizado el {new Date(acceptedAt).toLocaleString()}.</p>
            )}
          </section>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar mis respuestas'}
          </button>
        </form>
      </div>
    </div>
  );
}
