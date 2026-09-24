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
      <section className="aw-card" style={{ marginBottom:24 }}>
        <p className="aw-muted">Analizando tu CV contra las ofertas vigentes...</p>
      </section>
    );
  }

  if (!data) return null;

  const share = (count: number) => (data.analyzed > 0 ? Math.round((count / data.analyzed) * 100) : 0);

  return (
    <section className="aw-card" style={{ marginBottom:24 }}>
      <h2 className="aw-h2">Diagnóstico de tu CV</h2>
      <p className="aw-muted" style={{ marginBottom:20 }}>
        Comparado con {data.matched} {data.matched === 1 ? 'oferta vigente afín' : 'ofertas vigentes afines'} a tu perfil.
      </p>

      {data.matched === 0 ? (
        <p className="aw-muted">
          Hoy no hay ofertas vigentes que calcen con tu perfil.{' '}
          {data.nearMisses > 0 && <>Hay {data.nearMisses} de tu área que quedaron fuera por poca coincidencia. </>}
          FITCV sigue revisando los portales cada hora.
        </p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
          <div className="aw-grid-4">
            <Stat label="Calce alto" value={data.reach.alto} color="#6EE7B7" />
            <Stat label="Calce medio" value={data.reach.medio} color="#E1A526" />
            <Stat label="Calce bajo" value={data.reach.bajo} color="#A9B6C8" />
            <Stat label="Casi calzan" value={data.nearMisses} color="#6C7686" />
          </div>

          {data.entryLevelDiscarded > 0 && (
            <p className="aw-info">
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
            pillClass="aw-pill aw-pill-green"
            empty="Ninguno de tus términos aparece de forma repetida en estas ofertas."
          />

          <TopicList
            title="Lo que piden y tu CV no dice"
            help="Aparece en estas ofertas y no lo encontramos escrito en tu CV. Si lo has hecho, agrégalo; si no, es lo que te falta."
            items={data.gaps}
            share={share}
            pillClass="aw-pill aw-pill-orange"
            empty="Tu CV ya menciona todo lo que piden estas ofertas de forma repetida."
          />

          {data.unused.length > 0 && (
            <div>
              <p style={{ fontSize:14, fontWeight:600, color:'#F4F1E9', marginBottom:4 }}>Lo que ocupa espacio sin sumar</p>
              <p className="aw-dim" style={{ marginBottom:8 }}>
                Está en tu CV y ninguna de estas ofertas lo pide. Puede seguir siendo válido en otra área.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {data.unused.map((term) => (
                  <span key={term} className="aw-pill aw-pill-gray">{term}</span>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => router.push('/offers')} style={{ fontSize:13, fontWeight:600, color:'#E1A526', background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}>
            Ver las ofertas de tu perfil →
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="aw-stat">
      <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6C7686', marginBottom:4 }}>{label}</p>
      <p style={{ fontSize:24, fontWeight:700, color }}>{value}</p>
    </div>
  );
}

function TopicList({
  title, help, items, share, pillClass, empty,
}: {
  title: string; help: string; items: TopicCount[];
  share: (count: number) => number; pillClass: string; empty: string;
}) {
  return (
    <div>
      <p style={{ fontSize:14, fontWeight:600, color:'#F4F1E9', marginBottom:4 }}>{title}</p>
      <p className="aw-dim" style={{ marginBottom:8 }}>{help}</p>
      {items.length === 0 ? (
        <p className="aw-muted">{empty}</p>
      ) : (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {items.map((item) => (
            <span key={item.term} className={pillClass}>
              {item.term}
              <span style={{ marginLeft:6, opacity:.7 }}>{share(item.offers)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
