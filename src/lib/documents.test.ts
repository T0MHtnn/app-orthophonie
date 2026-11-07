import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('chiffrement des documents', () => {
  beforeAll(() => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('aller-retour sans perte, contenu illisible une fois chiffré', async () => {
    const { decryptDocument, encryptDocument } = await import('./documents');
    const clear = Buffer.from('Bilan de Léa : données de santé');
    const enc = encryptDocument(clear);
    expect(enc.includes(clear)).toBe(false);
    expect(decryptDocument(enc).equals(clear)).toBe(true);
  });

  it('refuse un fichier modifié', async () => {
    const { decryptDocument, encryptDocument } = await import('./documents');
    const enc = encryptDocument(Buffer.from('abc'));
    enc.writeUInt8(enc.readUInt8(enc.length - 1) ^ 1, enc.length - 1);
    expect(() => decryptDocument(enc)).toThrow();
  });

  it('refuse les types dangereux et les fichiers trop lourds', async () => {
    const { readUpload } = await import('./documents');
    expect((await readUpload(new File(['<svg/>'], 'x.svg'))).ok).toBe(false);
    expect((await readUpload(new File(['<html>'], 'x.html'))).ok).toBe(false);
    expect((await readUpload(new File([new Uint8Array(5 * 1024 * 1024)], 'x.pdf'))).ok).toBe(false);
    const ok = await readUpload(new File(['%PDF'], '../../bilan.pdf'));
    expect(ok.ok && ok.name).toBe('....bilan.pdf');
  });
});
