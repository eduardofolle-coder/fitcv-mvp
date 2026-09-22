'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { DiagnosisResponse, TopicCount } from '@/lib/types';

// Diagnóstico del CV contra las ofertas vigentes del área del candidato.
// Todo lo que se muestra es un conteo sobre ofertas reales: los vacíos hablan
// de lo que el CV no dice, nunca de lo que la persona no sabe hacer.
export function DiagnosisCard() {
  const router = useRouter();
  const [data, setData] = useState<DiagnosisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiClient.get<DiagnosisResponse>('/learning/diagnosis');
      if (cancelled) return;
      if (res.success && res.data) setData(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="bg-white rounded-lg shadow mb-8 p-6">
        <p className="text-sm text-gray-500">Analizando tu CV contra las ofertas vigentes...</p>
      </section>
    );
  }

  // Sin CV la tarjeta de perfil ya invita a subirlo; no hace falta repetirlo.
  if (!data) return null;

  const share = (count: number) => (data.analyzed > 0 ? Math.round((count / data.analyzed) * 100) : 0);

  return (
    <section className="bg-white rounded-lg shadow mb-8 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Diagnóstico de tu CV</h2>
      <p className="text-sm text-gray-600 mb-5">
        Comparado con {data.matched} {data.matched === 1 ? 'oferta vigente afín' : 'ofertas vigentes afines'} a tu
        perfil.
      </p>

      {data.matched === 0 ? (
        <p className="text-sm text-gray-700">
          Hoy no hay ofertas vigentes que calcen con tu perfil.{' '}
          {data.nearMisses > 0 && (
            <>
              Hay {data.nearMisses} de tu área que quedaron fuera por poca coincidencia.{' '}
            </>
          )}
          FITCV sigue revisando los portales cada hora.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Calce alto" value={data.reach.alto} tone="text-green-700" />
            <Stat label="Calce medio" value={data.reach.medio} tone="text-yellow-700" />
            <Stat label="Calce bajo" value={data.reach.bajo} tone="text-gray-700" />
            <Stat label="Casi calzan" value={data.nearMisses} tone="text-gray-500" />
          </div>

          {data.entryLevelDiscarded > 0 && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-md p-3">
              {data.entryLevelDiscarded}{' '}
              {data.entryLevelDiscarded === 1 ? 'oferta de tu área es' : 'ofertas de tu área son'} de práctica o
              primer empleo. No se te recomiendan por tus años de experiencia.
            </p>
          )}

          <TopicList
            title="Lo que te está abriendo puertas"
            help="Términos de tu CV que aparecen en las ofertas que alcanzas."
            items={data.strengths}
            share={share}
            className="bg-green-50 text-green-800"
            empty="Ninguno de tus términos aparece de forma repetida en estas ofertas."
          />

          <TopicList
            title="Lo que piden y tu CV no dice"
            help="Aparece en estas ofertas y no lo encontramos escrito en tu CV. Si lo has hecho, agrégalo; si no, es lo que te falta."
            items={data.gaps}
            share={share}
            className="bg-orange-50 text-orange-800"
            empty="Tu CV ya menciona todo lo que piden estas ofertas de forma repetida."
          />

          {data.unused.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-900">Lo que ocupa espacio sin sumar</p>
              <p className="text-xs text-gray-500 mb-2">
                Está en tu CV y ninguna de estas ofertas lo pide. Puede seguir siendo válido en otra área.
              </p>
              <div className="flex flex-wrap gap-2">
                {data.unused.map((term) => (
                  <span key={term} className="px-2.5 py-1 rounded-full text-sm bg-gray-100 text-gray-600">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => router.push('/offers')}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Ver las ofertas de tu perfil
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function TopicList({
  title,
  help,
  items,
  share,
  className,
  empty,
}: {
  title: string;
  help: string;
  items: TopicCount[];
  share: (count: number) => number;
  className: string;
  empty: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mb-2">{help}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item.term} className={`px-2.5 py-1 rounded-full text-sm ${className}`}>
              {item.term}
              <span className="ml-1.5 opacity-70">{share(item.offers)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
