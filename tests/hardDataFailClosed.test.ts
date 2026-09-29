// Si el contacto guardado no se puede descifrar, la postulación se detiene:
// no se sigue con el contacto vacío.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: {
    queryOne: vi.fn(async () => ({
      fullName: 'Ana Prueba', yearsExperience: 3, education: '[]', skills: '{}', experience: '[]',
      languages: '[]', certifications: '[]', contactInfo: 'iv:tag:datosCifradosConOtraClave',
    })),
  },
}));
vi.mock('../src/services/encryption.js', () => ({
  EncryptionService: { decrypt: () => { throw new Error('Unsupported state or unable to authenticate data'); } },
}));

describe('loadHardData', () => {
  it('rechaza en vez de continuar con el contacto vacío cuando falla el descifrado', async () => {
    const { loadHardData } = await import('../src/services/candidateProfile.js');
    await expect(loadHardData('u1')).rejects.toMatchObject({ statusCode: 500 });
  });
});
