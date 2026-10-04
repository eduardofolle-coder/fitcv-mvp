import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PORTALS } from '../src/services/portals.js';

// La extensión solo puede consultar los sitios de su manifiesto (host_permissions). Si un portal tiene una
// dirección de comprobación de sesión fuera de esa lista, la consulta falla y el portal queda "sin sesión" para siempre.
const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'fitcv-extension', 'manifest.json'), 'utf-8'));
const hosts: string[] = manifest.host_permissions;

const covered = (url: string) => {
  const { hostname } = new URL(url);
  return hosts.some(pattern => {
    const host = pattern.replace(/^https:\/\//, '').replace(/\/\*$/, '');
    return host.startsWith('*.') ? hostname === host.slice(2) || hostname.endsWith(host.slice(1)) : hostname === host;
  });
};

describe('permisos de la extensión y comprobación de sesión', () => {
  it('cada portal verificable puede consultarse con los permisos del manifiesto', () => {
    for (const portal of PORTALS.filter(p => p.checkUrl)) {
      expect(covered(portal.checkUrl!), `${portal.id}: ${portal.checkUrl}`).toBe(true);
    }
  });

  it('Chiletrabajos se verifica solo (ya no pide "Ya inicié sesión")', () => {
    expect(PORTALS.find(p => p.id === 'chiletrabajos')?.checkUrl).toMatch(/chiletrabajos\.cl\/dashboard$/);
  });
});
