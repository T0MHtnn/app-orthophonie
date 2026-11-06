import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { PracticeRow, ProfileRow } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

export interface AuthContext {
  userId: string;
  email: string;
  profile: ProfileRow;
  /** Niveau actuel de la session et niveau atteignable (aal2 si un facteur 2FA existe). */
  aal: 'aal1' | 'aal2';
  hasMfa: boolean;
  practice: PracticeRow | null;
}

/**
 * Contexte de l'utilisateur connecté, calculé une fois par requête.
 * Utilise getClaims() (jeton vérifié) puis lit profil et cabinet sous RLS.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await loadSession();
  return session.kind === 'ok' ? session.ctx : null;
});

/**
 * « orphan » = session valide mais profil introuvable (compte supprimé en
 * partie, par exemple depuis la table profiles). On déconnecte proprement
 * au lieu de boucler sur la page de connexion.
 */
export const getSessionStatus = cache(async (): Promise<'none' | 'orphan' | 'ok'> => (await loadSession()).kind);

type Session = { kind: 'none' } | { kind: 'orphan' } | { kind: 'ok'; ctx: AuthContext };

const loadSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { kind: 'none' };

  const [{ data: profile }, { data: practice }, { data: aal }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', claims.sub).maybeSingle(),
    supabase.from('practices').select('*').eq('owner_id', claims.sub).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!profile) return { kind: 'orphan' };

  return {
    kind: 'ok',
    ctx: {
      userId: claims.sub,
      email: String(claims.email ?? ''),
      profile,
      aal: aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
      hasMfa: aal?.nextLevel === 'aal2',
      practice: practice ?? null,
    },
  };
});

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect((await getSessionStatus()) === 'orphan' ? '/auth/session-invalide' : '/connexion');
  return ctx;
}

/** Espace ortho : rôle ortho + cabinet créé + double authentification validée. */
export async function requireOrtho(): Promise<AuthContext & { practice: PracticeRow }> {
  const ctx = await requireUser();
  if (ctx.profile.role !== 'ortho' || !ctx.practice) redirect('/cabinet/creer');
  if (!ctx.hasMfa) redirect('/mfa/activer');
  if (ctx.aal !== 'aal2') redirect('/mfa/verifier');
  return ctx as AuthContext & { practice: PracticeRow };
}

/** Page d'accueil selon le profil. */
export function homeFor(ctx: AuthContext): string {
  if (ctx.profile.role === 'ortho') return '/ortho';
  if (ctx.profile.role === 'admin') return '/patient';
  return '/patient';
}
