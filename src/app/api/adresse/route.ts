import { NextResponse, type NextRequest } from 'next/server';
import { suggestAddresses } from '@/lib/address';
import { getAuthContext } from '@/lib/auth';

/** Saisie automatique de l'adresse du cabinet (création du cabinet, Réglages). Compte requis. */
export async function GET(request: NextRequest) {
  if (!(await getAuthContext())) return NextResponse.json([], { status: 401 });
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json([]);
  return NextResponse.json(await suggestAddresses(q));
}
