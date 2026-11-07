import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { DOCUMENTS_BUCKET, decryptDocument } from '@/lib/documents';
import { createClient } from '@/lib/supabase/server';

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Téléchargement d'un document, déchiffré à la volée. Accès revérifié par la base :
 * l'ortho du cabinet (RLS, aal2) ou la famille du patient (document partagé ou déposé par elle).
 * Toujours en pièce jointe : le navigateur n'exécute jamais le fichier dans la page.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  let doc: { name: string; mime_type: string; storage_path: string } | null = null;
  if (ctx.profile.role === 'ortho') {
    const { data } = await supabase.from('patient_documents').select('name, mime_type, storage_path').eq('id', id).maybeSingle();
    doc = data;
  }
  if (!doc) {
    // Côté famille, le chemin n'est jamais exposé : on le relit pour le document autorisé.
    const { data: mine } = await supabase.rpc('my_documents');
    const found = mine?.find((d) => d.id === id);
    if (found) {
      const { data: path } = await supabase.rpc('my_document_path', { p_id: id });
      if (path) doc = { name: found.name, mime_type: found.mime_type, storage_path: path };
    }
  }
  if (!doc) return new NextResponse(null, { status: 404 });

  const { data: blob, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
  if (error || !blob) {
    console.error('download_document', error?.name ?? 'empty');
    return new NextResponse(null, { status: 404 });
  }
  let body: Buffer;
  try {
    body = decryptDocument(Buffer.from(await blob.arrayBuffer()));
  } catch (e) {
    console.error('decrypt_document', e instanceof Error ? e.message : 'error');
    return new NextResponse(null, { status: 500 });
  }
  const ascii = doc.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
