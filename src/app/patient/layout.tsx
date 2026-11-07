import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';

/** Espace famille : même cadre que l'espace ortho. */
export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  return <AppShell ctx={await requireUser()}>{children}</AppShell>;
}
