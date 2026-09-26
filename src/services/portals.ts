/** Portales de empleo donde el candidato necesita su propia cuenta para postular. */
export interface PortalInfo {
  id: string;
  name: string;
  /** Dominio del portal: si el candidato navega en él, la extensión vuelve a verificar. */
  domain: string;
  /**
   * Página que exige sesión y, sin ella, el servidor redirige al login. Así la
   * extensión sabe si hay sesión sin tocar nada. null: el portal arma su cuenta
   * en el navegador y no se puede verificar así; se aprende de los intentos.
   */
  checkUrl: string | null;
  connectUrl: string;
  signupUrl: string;
}

export const PORTALS: PortalInfo[] = [
  {
    id: 'chiletrabajos', name: 'Chiletrabajos', domain: 'chiletrabajos.cl', checkUrl: null,
    connectUrl: 'https://www.chiletrabajos.cl/chtlogin', signupUrl: 'https://www.chiletrabajos.cl/chtregister',
  },
  {
    id: 'trabajando', name: 'Trabajando.com', domain: 'trabajando.cl', checkUrl: null,
    connectUrl: 'https://www.trabajando.cl/ingresa-a-tu-cuenta', signupUrl: 'https://www.trabajando.cl/crea-tu-curriculum',
  },
  {
    id: 'bne', name: 'Bolsa Nacional de Empleo', domain: 'bne.gob.cl',
    checkUrl: 'https://www.bne.gob.cl/postulantes/mis-postulaciones',
    connectUrl: 'https://www.bne.gob.cl/postulantes/mis-postulaciones', signupUrl: 'https://www.bne.gob.cl/registro/clave',
  },
  {
    id: 'computrabajo', name: 'Computrabajo', domain: 'computrabajo.com',
    checkUrl: 'https://candidato.cl.computrabajo.com/candidate/home',
    connectUrl: 'https://candidato.cl.computrabajo.com/candidate/home', signupUrl: 'https://candidato.cl.computrabajo.com/acceso/',
  },
  {
    id: 'getonbrd', name: 'Get on Board', domain: 'getonbrd.com',
    checkUrl: 'https://www.getonbrd.com/webpros/applications',
    connectUrl: 'https://www.getonbrd.com/webpros/login', signupUrl: 'https://www.getonbrd.com/webpros/login',
  },
  {
    id: 'trabajosdiarios', name: 'Trabajos Diarios', domain: 'trabajosdiarios.com',
    checkUrl: 'https://cl.trabajosdiarios.com/candidatos/postulaciones',
    connectUrl: 'https://cl.trabajosdiarios.com/candidatos', signupUrl: 'https://cl.trabajosdiarios.com/candidatos/registro',
  },
  {
    id: 'portalminero', name: 'Portal Minero', domain: 'portalminero.com',
    checkUrl: 'https://rrhh.portalminero.com/postulante/mis-postulaciones',
    connectUrl: 'https://rrhh.portalminero.com/postulante/login', signupUrl: 'https://rrhh.portalminero.com/postulante/login',
  },
  {
    id: 'firstjob', name: 'FirstJob', domain: 'firstjob.me', checkUrl: null,
    connectUrl: 'https://firstjob.me/usuarios/ingresar', signupUrl: 'https://firstjob.me/usuarios/registro/nueva_cuenta',
  },
];

export const portalById = new Map(PORTALS.map(p => [p.id, p]));
export const isKnownPortal = (portal: string): boolean => portalById.has(portal);
