import { AppShell } from '@/components/app-shell';
import { requireOrtho } from '@/lib/auth';

/** Espace ortho : chaque page en dessous est protégée (rôle + cabinet + aal2). */
export default async function OrthoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell ctx={await requireOrtho()}>{children}</AppShell>;
}
