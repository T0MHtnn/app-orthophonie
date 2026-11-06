# Sécurité

L'app traite des **données de santé** (motif de consultation, âge, notes). Les règles ci-dessous sont appliquées dès le premier lot et vérifiées par des tests.

## Ce qui est en place

### Base de données (Supabase / Postgres)

- **RLS activée sur toutes les tables**, et droits retirés explicitement à `anon` et `authenticated` avant d'être rendus au cas par cas.
- **Droits par colonne** : un utilisateur ne peut modifier ni son rôle, ni le numéro RPPS, ni le statut « vérifié » de son cabinet. Sur la liste d'attente, l'ortho ne peut changer que le statut.
- **Double authentification exigée par la base** : les inscrits ne sont lisibles qu'avec une session `aal2`. Même avec un mot de passe volé, rien n'est lisible sans le téléphone.
- **Rôle jamais pris côté client** : à l'inscription, tout le monde est « patient ». Le rôle « ortho » n'est donné que par `register_practice()`, après confirmation de l'email.
- **Isolation des cabinets** : un ortho ne voit et ne modifie que les inscrits de son propre cabinet.
- **Liste d'attente** : inscription réservée aux comptes à l'email confirmé, via la seule fonction `submit_waitlist_entry()` (aucune insertion directe). Elle revérifie que le cabinet est vérifié et ouvert, refuse les doublons et limite le débit (5 inscriptions par heure et par compte, 200 par jour et par cabinet). Une famille ne voit et ne retire que ses propres demandes.
- **Fonctions `SECURITY DEFINER`** avec `search_path` vide (protection contre le détournement de schéma).
- **Journal d'audit** en ajout seul : qui a créé, modifié ou supprimé quoi, sans aucun contenu de santé.
- Tests : `npm run test:db` couvre élévation de rôle, accès inter-cabinets, accès sans 2FA, insertion directe, limitation de débit, journal non effaçable.

### Application (Next.js)

- **Jetons de session en cookies `httpOnly`, `Secure`, `SameSite=Lax`** : l'app n'utilise jamais Supabase depuis le navigateur, un script injecté ne peut donc pas voler la session.
- **Identité vérifiée avec `getClaims()`** (signature du jeton) côté serveur, à chaque page et dans chaque action. Le middleware n'est pas la seule barrière.
- **Content-Security-Policy stricte avec nonce** par requête (`strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`), plus HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`.
- **Pas de cache** sur les pages connectées (`Cache-Control: no-store`), pages non indexées par les moteurs.
- **Déconnexion après 30 min d'inactivité** dans l'espace ortho (recommandation CNIL).
- **Validation zod** de toutes les entrées côté serveur, revérifiées par les contraintes SQL.
- **Aucun HTML interprété** dans les textes saisis par l'ortho (rendu React en texte).
- **Redirections sûres** : les paramètres `suivant` / `next` n'acceptent que des chemins internes. Les liens des emails redirigent toujours vers `NEXT_PUBLIC_SITE_URL`, jamais vers l'hôte de la requête.
- **Pas d'énumération de comptes** : mêmes messages que le compte existe ou non (connexion, inscription, mot de passe oublié).
- **Mots de passe** : 12 caractères minimum, minuscules, majuscules et chiffres.
- **Champ piège** anti-robots sur le formulaire public.
- **Pas de clé secrète Supabase dans l'app** : tout passe par la session de l'utilisateur, donc sous la RLS.
- **Polices auto-hébergées** : aucune requête vers un service tiers depuis le navigateur des familles.

## À faire avant d'accueillir de vrais patients

### Passage en production HDS (obligatoire)

L'article L.1111-8 du Code de la santé publique impose un hébergeur certifié HDS pour les données de santé. **Ni Supabase Cloud ni Vercel ne le sont.** Le code est prévu pour migrer sans réécriture :

1. Choisir un hébergeur certifié HDS ([liste de l'ANS](https://esante.gouv.fr/offres-services/hds/liste-des-hebergeurs-certifies)), par exemple Scaleway, OVHcloud, Clever Cloud ou Scalingo. Lire l'annexe de périmètre du certificat (activités couvertes).
2. **Base + Auth** : Supabase auto-hébergé (open source, Docker) sur l'infrastructure HDS, ou Postgres managé HDS + un service d'authentification hébergé HDS. Appliquer les mêmes migrations.
3. **Application** : déployer Next.js (`npm run build && npm start`, ou image Docker) chez l'hébergeur HDS, à la place de Vercel.
4. **Activité 5 (administration et exploitation)** : soit se faire certifier, soit passer par un infogérant certifié. À trancher avec l'hébergeur.
5. Changer les variables d'environnement, refaire le parcours complet, lancer `npm run test:db` sur la nouvelle base.
6. **Emails** : utiliser un service d'envoi conforme et n'y mettre aucune donnée de santé détaillée.

### RGPD et contrats

- Registre des traitements, **analyse d'impact (AIPD)**, mentions d'information et politique de confidentialité.
- Contrat de sous-traitance (art. 28 RGPD) avec chaque orthophoniste, et avec l'hébergeur.
- Durées de conservation : purge des inscriptions « retirées » après un délai à fixer, conservation des dossiers selon les recommandations.
- Procédure de violation de données (notification CNIL sous 72 h).

### Renforcements prévus

- CAPTCHA respectueux de la vie privée sur le formulaire public et la connexion (Cloudflare Turnstile, gratuit). Supabase Auth applique déjà ses propres limites de débit.
- Vérification automatique du RPPS via l'API Annuaire Santé, à la place de la vérification manuelle.
- Envoi d'emails depuis l'app (aujourd'hui : copie du texte ou ouverture dans la messagerie de l'ortho).
- Codes de secours pour la double authentification.
- Sauvegardes chiffrées et test de restauration (le plan gratuit Supabase n'a pas de sauvegardes restaurables).
- Test d'intrusion avant ouverture publique.
- Surveillance des dépendances (`npm audit`, Dependabot).

## Signaler une faille

Écrire au responsable du projet plutôt que d'ouvrir un ticket public.
