import { redirect } from 'next/navigation';

/** Entrée de l'espace ortho (après connexion) : le planning. */
export default function OrthoHome() {
  redirect('/ortho/planning');
}
