# App orthophonie

Application de gestion de cabinet pour orthophonistes libéraux. Premier lot : comptes, double authentification, cabinet, **liste d'attente** (page publique + espace ortho) et **réglages** (texte d'information, email type).

Stack : **Next.js 15** (App Router, TypeScript) · **Supabase** (Postgres + Auth) · **Vercel**.

> ⚠️ **Données fictives uniquement pour l'instant.** Supabase et Vercel ne sont pas certifiés HDS. Aucune vraie donnée de patient ne doit y être saisie. Voir [SECURITY.md](SECURITY.md), section « Passage en production HDS ».

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (voir plus bas)
npm run dev                  # http://localhost:3000
```

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm run typecheck` | Vérifie les types TypeScript |
| `npm test` | Tests unitaires (validation, sécurité, textes) |
| `npm run test:db` | Applique la migration sur un Postgres local jetable et lance les tests de sécurité de la base (nécessite PostgreSQL installé) |
| `npm run build` | Build de production |

## Mettre en place Supabase (gratuit)

1. Créer un projet sur [supabase.com](https://supabase.com), **région Paris (eu-west-3)**, plan Free.
2. **SQL Editor** → coller et exécuter `supabase/migrations/20261106120000_init.sql`.
   (Ou avec la CLI : `npx supabase link` puis `npx supabase db push`.)
3. **Project Settings → API Keys** : copier l'URL et la clé *publishable* dans `.env.local`.
4. **Authentication → URL Configuration**
   - Site URL : `http://localhost:3000` (puis l'URL Vercel en ligne).
   - Redirect URLs : `http://localhost:3000/**` et `https://<votre-app>.vercel.app/**`.
5. **Authentication → Providers → Email** : laisser « Confirm email » activé. Longueur minimale du mot de passe : **12**, exiger minuscules, majuscules et chiffres.
6. **Authentication → Email Templates** : dans « Confirm signup » et « Reset password », remplacer le lien par :
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
   ```
   (pour « Reset password » : `&type=recovery&next=/compte/mot-de-passe`).
7. **Authentication → Multi-Factor** : activer **TOTP** (gratuit).

### Valider un cabinet (rôle admin)

À la création, un cabinet est « en cours de vérification » : sa page publique reste fermée. Après contrôle du numéro RPPS (sur [annuaire.sante.fr](https://annuaire.sante.fr)), dans le SQL Editor :

```sql
update public.practices set verified = true where slug = 'cabinet-de-maelle-fouilleul';
```

## Mettre en ligne sur Vercel (gratuit)

1. Pousser le projet sur GitHub (le fichier `.env.local` est ignoré, ne jamais le commiter).
2. Sur [vercel.com](https://vercel.com) : *Add New → Project* → importer le dépôt.
3. *Environment Variables* : ajouter les 3 variables de `.env.example`, avec `NEXT_PUBLIC_SITE_URL=https://<votre-app>.vercel.app`.
4. Déployer. Les fonctions tournent à Paris (`vercel.json` → `cdg1`).
5. Reporter l'URL Vercel dans Supabase (Site URL + Redirect URLs).

## Parcours

- **Orthophoniste** : `/inscription` → email de confirmation → `/cabinet/creer` (nom, adresse publique, RPPS) → `/mfa/activer` (QR code) → `/ortho/liste-attente`.
- **Famille** : `/c/<adresse-du-cabinet>` → crée un compte ou se connecte → lit le texte d'information, coche la case, remplit le formulaire → suit ou retire sa demande sur `/patient`.
- **Ortho, liste d'attente** : filtre par motif, statut (en attente, contacté, RDV pris, retiré), « Proposer une place » prépare l'email à partir du modèle, suppression définitive (RGPD).
- **Ortho, réglages** : nom du cabinet, ouverture des inscriptions, texte d'information, **modèle de l'email « place libérée »**.

## Organisation du code

```
src/
├── middleware.ts            CSP avec nonce, session, pages protégées, déconnexion après 30 min
├── lib/
│   ├── auth.ts              Contexte utilisateur, requireUser / requireOrtho
│   ├── validation.ts        Schémas zod de toutes les entrées
│   ├── security.ts          Redirections sûres
│   ├── text.ts              Mise en forme des textes de l'ortho (sans HTML)
│   ├── defaults.ts          Texte d'information et email type par défaut
│   ├── env.ts               Variables d'environnement validées
│   └── supabase/            Client serveur lié à la session
├── components/              Formulaires, affichage du texte d'information
└── app/
    ├── (auth)/              Connexion, inscription, mot de passe oublié
    ├── auth/                Liens des emails
    ├── mfa/                 Activation et vérification de la double authentification
    ├── cabinet/creer/       Création du cabinet
    ├── c/[slug]/            Page publique de liste d'attente
    ├── ortho/               Espace ortho : liste d'attente, réglages
    └── patient/             Espace famille : suivi des demandes
supabase/
├── migrations/              Schéma, RLS, fonctions
└── tests/                   Tests de sécurité de la base
```
