import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Documents des patients : chiffrés par le serveur (AES-256-GCM) avant d'aller dans le
 * stockage Supabase. Même lu directement dans le stockage, un fichier est illisible sans
 * DOCUMENTS_ENCRYPTION_KEY (64 caractères hexadécimaux, variable d'environnement Vercel).
 * ⚠️ Perdre cette clé = perdre l'accès à tous les documents : la garder en lieu sûr.
 */
export const DOCUMENTS_BUCKET = 'patient-documents';
/** 4 Mo : en dessous de la limite d'une requête sur Vercel (4,5 Mo). */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Types acceptés (extension → type). Pas de HTML ni de SVG : ils pourraient exécuter du code. */
export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES)
  .map((e) => `.${e}`)
  .join(',');

const MAGIC = Buffer.from('OD1');

function key(): Buffer | null {
  const hex = process.env.DOCUMENTS_ENCRYPTION_KEY ?? '';
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}

export const documentsConfigured = () => key() !== null;

/** Format : « OD1 » + IV (12 octets) + tag (16 octets) + contenu chiffré. */
export function encryptDocument(data: Buffer): Buffer {
  const k = key();
  if (!k) throw new Error('documents_key_missing');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptDocument(data: Buffer): Buffer {
  const k = key();
  if (!k) throw new Error('documents_key_missing');
  if (data.length < 31 || !data.subarray(0, 3).equals(MAGIC)) throw new Error('documents_bad_format');
  const decipher = createDecipheriv('aes-256-gcm', k, data.subarray(3, 15));
  decipher.setAuthTag(data.subarray(15, 31));
  return Buffer.concat([decipher.update(data.subarray(31)), decipher.final()]);
}

export type FileCheck = { ok: true; name: string; mime: string; data: Buffer } | { ok: false; message: string };

/** Vérifie un fichier reçu d'un formulaire : présent, pas trop gros, type autorisé (par l'extension). */
export async function readUpload(file: FormDataEntryValue | null): Promise<FileCheck> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choisissez un fichier.' };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, message: 'Fichier trop lourd (4 Mo maximum).' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = DOCUMENT_TYPES[ext];
  if (!mime) return { ok: false, message: 'Type de fichier non accepté (PDF, image, Word, OpenDocument, texte ou audio).' };
  // Nom affiché : sans chemin ni caractères de contrôle.
  const name = file.name.replace(/[\u0000-\u001f\\/]/g, '').trim().slice(0, 200) || `document.${ext}`;
  return { ok: true, name, mime, data: Buffer.from(await file.arrayBuffer()) };
}

export const storagePath = (practiceId: string, patientId: string) => `${practiceId}/${patientId}/${crypto.randomUUID()}`;

/** Erreur du stockage pour les logs : type, code HTTP et message technique (jamais le contenu ni le nom du fichier). */
export function storageError(error: unknown): string {
  const e = error as { name?: string; status?: number; statusCode?: string | number; message?: string; originalError?: { message?: string } };
  return [e.name, e.status ?? e.statusCode, e.message?.slice(0, 160), e.originalError?.message?.slice(0, 160)].filter(Boolean).join(' | ');
}
