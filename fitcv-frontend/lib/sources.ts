// Nombre visible de cada portal de origen de las ofertas.
export const SOURCE_LABELS: Record<string, string> = {
  getonbrd: 'Get on Board',
  trabajando: 'Trabajando.com',
  chiletrabajos: 'Chiletrabajos',
  bne: 'Bolsa Nacional de Empleo',
  portalminero: 'Portal Minero',
  trabajosdiarios: 'Trabajos Diarios',
  linkedin: 'LinkedIn',
  computrabajo: 'Computrabajo',
  laborum: 'Laborum',
  firstjob: 'FirstJob',
  empresa: 'Sitio de empresa',
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;
