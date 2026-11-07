import 'server-only';
import { cookies } from 'next/headers';
import { LANG_COOKIE, isLang, type Lang } from './preferences';

/**
 * Traductions. Pour l'instant : le cadre de l'app (menu, bandeau) et « Mon compte ».
 * Le reste de l'app est encore en français uniquement (à traduire écran par écran).
 */
const fr = {
  nav: {
    planning: 'Planning',
    waitlist: 'Liste d’attente',
    settings: 'Réglages',
    account: 'Mon compte',
    familyRequests: 'Mes demandes (famille)',
    mySpace: 'Mon espace',
    find: 'Trouver un orthophoniste',
  },
  logout: 'Se déconnecter',
  account: {
    title: 'Mon compte',
    connectedAs: 'Connecté avec',
    info: 'Mes informations',
    firstName: 'Prénom',
    lastName: 'Nom',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    security: 'Sécurité',
    changePassword: 'Changer mon mot de passe',
    display: 'Affichage',
    language: 'Langue',
    languageHint: 'L’anglais couvre pour l’instant le menu et cette page ; le reste de l’app arrive progressivement.',
    theme: 'Thème',
    themeHint: 'Appliqué tout de suite, et gardé sur cet appareil.',
  },
};

type Dict = typeof fr;

const en: Dict = {
  nav: {
    planning: 'Schedule',
    waitlist: 'Waiting list',
    settings: 'Settings',
    account: 'My account',
    familyRequests: 'My requests (family)',
    mySpace: 'My space',
    find: 'Find a speech therapist',
  },
  logout: 'Log out',
  account: {
    title: 'My account',
    connectedAs: 'Signed in as',
    info: 'My details',
    firstName: 'First name',
    lastName: 'Last name',
    save: 'Save',
    saving: 'Saving…',
    security: 'Security',
    changePassword: 'Change my password',
    display: 'Display',
    language: 'Language',
    languageHint: 'English currently covers the menu and this page; the rest of the app is being translated.',
    theme: 'Theme',
    themeHint: 'Applied right away and kept on this device.',
  },
};

const DICTS: Record<Lang, Dict> = { fr, en };

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'fr';
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: DICTS[lang] };
}
