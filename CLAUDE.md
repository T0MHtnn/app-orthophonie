# CLAUDE.md — contexte du projet

Ce fichier est lu automatiquement par Claude Code. Il résume tout ce qui a été décidé avant le passage à la CLI. **À garder à jour** quand une décision change.

## Le projet

App web pour **orthophonistes libéraux** (France) : gérer le cabinet à moindre coût (gratuit au départ, puis moins cher que Perfactive / Doctolib). Porteur : **Tom**, étudiant développeur, peu de temps. Claude code, Tom supervise et teste.

## Comment travailler avec Tom

- Répondre **en français**, **court et concret**. Pas de longues docs à lui faire lire : les explications vont dans la réponse, en quelques lignes par fonctionnalité.
- **Vérifier une hypothèse avant de lui faire changer un réglage** (Supabase, Brevo, Vercel). Lui faire lire un log ou lancer une requête SQL de diagnostic d'abord. Une conclusion non vérifiée lui a déjà fait perdre du temps.
- **Retours non bloquants** : les noter dans « Retours en attente » (en bas) et les corriger en lot. **Bloquant** : corriger tout de suite.
- Après chaque changement : dire s'il faut lancer une migration (`npx supabase db push --remote`), ajouter une variable d'environnement, ou faire un réglage dans un tableau de bord.
- Ne plus toucher au cahier des charges ni à la maquette (projets séparés, figés).
- Le nom de l'app est provisoire : quand Tom le change, lui lister exactement quoi modifier (`src/lib/app.ts`, `package.json`, modèles d'email Supabase, `EMAIL_SENDER_NAME`, projet Vercel/URL, Supabase URL Configuration, dépôt GitHub).

## Stack

- **Next.js 15.5** (App Router, Server Actions, TypeScript strict), React 19, zod 4. Pas de framework CSS : `src/app/globals.css` (couleurs reprises de la maquette).
- **Supabase** : Postgres + Auth (email/mot de passe uniquement — **pas de connexion Google**, choix de Tom —, MFA TOTP). Projet `obidpbldenamwdqvtwyz`, région **eu-west-2 (Londres)**, plan Free.
- **Vercel** (Hobby) : `https://app-orthophonie.vercel.app`, déploiement auto sur push `main`.
- **Brevo** (gratuit, 300 emails/jour, quota partagé avec une autre app de Tom) :
  - SMTP branché dans Supabase pour les emails d'auth (modèles dans `supabase/templates/`, à coller dans Supabase > Authentication > Emails > Templates) ;
  - API transactionnelle pour les emails envoyés par l'app (`src/lib/email.ts`).
  - Expéditeur = une adresse Gmail (pas de nom de domaine) → risque de spam, à corriger avec un domaine plus tard.
- Polices auto-hébergées via `@fontsource` (pas de Google Fonts : bloqué au build en sandbox et inutile côté vie privée).

⚠️ **Supabase et Vercel ne sont pas certifiés HDS.** Données **fictives uniquement**. Migration vers un hébergeur HDS obligatoire avant de vrais patients (voir `SECURITY.md`).

## Commandes

```bash
npm run dev          # localhost:3000
npm run typecheck
npm test             # vitest : validation, sécurité, textes, emails
npm run test:db      # migration + tests de sécurité SQL sur un Postgres local jetable
npm run build
npx supabase db push --remote   # appliquer les migrations (l'intégration GitHub de Supabase n'est PAS fiable)
```

Variables : voir `.env.example` (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `BREVO_API_KEY`, `EMAIL_SENDER_EMAIL`, `EMAIL_SENDER_NAME`). Pas de clé secrète Supabase dans l'app.

## Règles de sécurité (à respecter dans tout nouveau code)

- **RLS partout**. Chaque migration : `revoke all ... from anon, authenticated`, puis grants **par colonne** au strict nécessaire. Jamais de policy `using (true)` sur des données de santé.
- **Données de santé = aal2 obligatoire dans la RLS** (`private.is_aal2()`), et isolation par cabinet (`private.owns_practice()`).
- Écritures sensibles via fonctions `security definer` avec `set search_path = ''` et contrôles explicites (`auth.uid()`, email confirmé, statut).
- Le **rôle n'est jamais lu depuis le client** (le trigger crée tout le monde en `patient` ; `register_practice()` passe en `ortho`).
- **Aucun client Supabase dans le navigateur** : tout passe par le serveur, cookies de session `httpOnly`. Identité via `getClaims()`, jamais `getSession()` côté serveur.
- Chaque Server Action revérifie l'accès (`requireUser` / `requireOrtho`), même si la page le fait déjà.
- Validation zod de toutes les entrées (`src/lib/validation.ts`), reprise par des `check` SQL. Ne pas importer zod dans un composant client (mettre les helpers purs dans un fichier sans dépendance, ex. `lib/slug.ts`, `lib/age.ts`).
- CSP stricte avec nonce dans `src/middleware.ts` : toutes les pages doivent rester dynamiques (le root layout lit `headers()`).
- Textes saisis par l'ortho : rendus en texte React, jamais de HTML injecté (`lib/text.ts`, `components/info-text.tsx`). Emails : HTML échappé (`lib/email-format.ts`).
- **Logs** : codes d'erreur uniquement, jamais d'email, de nom ni de donnée de santé.
- **Emails** : aucune donnée médicale (motif, notes) dedans.
- Migrations : **toujours un nouveau fichier** dans `supabase/migrations/`, ne jamais modifier une migration déjà appliquée. Ajouter les tests correspondants dans `supabase/tests/rls.test.sql` et vérifier `npm run test:db`.
- Mettre à jour `src/lib/database.types.ts` à chaque changement de schéma (types écrits à la main pour l'instant).

## Fait (V1)

- Comptes : inscription (ortho ou patient/parent), confirmation email, connexion, mot de passe oublié, œil sur les mots de passe. Connexion uniquement par compte de l'app (pas de Google).
- Ortho : création du cabinet (nom, adresse publique `/c/<slug>`, RPPS avec clé de Luhn ; cabinet `verified = false` jusqu'à validation manuelle en SQL), **MFA TOTP obligatoire**, déconnexion après 30 min d'inactivité **pour tous les comptes** (ortho et patient, pages protégées ; activité comptée sur toute l'app).
- Liste d'attente :
  - page publique `/c/<slug>` : texte d'information modifiable + case de lecture obligatoire, **compte requis** (créer / se connecter, retour automatique au formulaire) ;
  - formulaire : patient, âge (nombre + ans/mois ; ≥ 18 ans → champs parent/aidant grisés, obligatoires sinon), motif (pathologies), contact, notes, consentement, champ piège anti-robot, valeurs conservées et erreurs encadrées en rouge ;
  - limites : 5 inscriptions/h/compte, 200/jour/cabinet, pas de doublon ;
  - accusé de réception par email (Brevo).
- Côté ortho : liste filtrable par motif, statuts **En attente → Place proposée → Pris en charge → Retiré**, « Proposer une place » (email type rempli, bouton « Envoyer l'email » via Brevo avec reply-to = ortho, ou copier / ouvrir dans sa messagerie), suppression définitive (RGPD).
- Réglages ortho : nom du cabinet, ouverture des inscriptions, texte d'information, modèle d'email « place libérée » (champs `{aidant}` `{patient}` `{lien}` `{orthophoniste}` `{cabinet}`).
- Espace famille `/patient` : **verrouillé** (« Aucune place ne vous a encore été trouvée » / « Une place vous a été proposée ») tant qu'aucune demande n'est en « Pris en charge » ; liste des demandes, retrait d'une demande.
- Comptes : prénom / nom séparés (`profiles.first_name`, `last_name`, `full_name` calculé), page **Mon compte** (`/compte`) ; même cadre (bandeau + menu, `components/app-shell.tsx`) pour l'espace ortho et l'espace famille.
- Téléphone normalisé (`lib/phone.ts`) : `06 12 34 56 78` ou international `+32…`, revérifié par un trigger SQL.
- Emails de l'app : nom d'expéditeur = nom du cabinet, adresse = `EMAIL_SENDER_EMAIL`, reply-to = l'ortho.
- Liste d'attente en 2 onglets : « File d'attente » (en attente + place proposée, retirés en option) et « Patients pris en charge » ; recherche nom/prénom (patient ou aidant, sans accents) et filtre motif appliqués tout de suite (`?q=` `?motif=` `?onglet=suivis`). Futur module Patients : partira de cet onglet.
- Type de demande (brainstorm) : « Bilan seul » / « Bilan + rééducation si nécessaire » / « Rééducation uniquement », obligatoire dans le formulaire, affiché et filtrable côté ortho, visible dans l'espace famille.
- **Annuaire** `/trouver` (public, sans compte) : recherche ville / code postal / nom du cabinet ou de l'ortho (`search_practices`, sans accents), uniquement cabinets vérifiés + liste ouverte + `listed` + ville renseignée. Adresse du cabinet (rue facultative, code postal, ville) demandée à la création et modifiable dans les Réglages, case « Apparaître dans l'annuaire » (cochée par défaut). Une famille inscrite depuis `/inscription` (sans lien de cabinet) arrive sur `/trouver` après confirmation. Le but : l'ortho n'a rien à faire, les familles trouvent le cabinet seules.
- Un ortho peut aussi être « famille » (inscrire ses enfants / un proche) dans un **autre** cabinet, jamais dans le sien (`P0403` dans `submit_waitlist_entry`) ; son cabinet n'apparaît pas dans ses résultats d'annuaire. Menu ortho : « Mes demandes (famille) » → `/patient`.
- **Planning étape 1** (`/ortho/planning`) : **tout est ouvert sauf ce que l'ortho bloque** (choix de Tom : pas d'horaires d'ouverture). Clic sur un créneau vide → pop-up « Bloquer » (titre, date, heures, répétition : aucune / jour / semaine / 2 sem. / 3 sem. / mois / certains jours, jusqu'au…), clic sur un blocage → modifier ou supprimer (toute la série ou ce jour seulement, via `skip_dates`). Liste des patients à droite (sans RDV en premier) : glisser-déposer sur l'agenda (ou toucher le patient puis le créneau), RDV déplaçables en les glissant, clic → modifier / annuler. Table `schedule_blocks`, contrôle SQL `private.block_overlaps` (refus `P0410`) + chevauchement (`P0409`) dans `save_appointment`. Table `patients` (fiche minimale) créée par trigger à « Pris en charge ». Heures de Paris : `lib/time.ts`, grille et répétitions : `lib/agenda.ts` (même règle qu'en SQL).
- **Étape 3 — abandonnée (règle de Tom)** : les nouveaux patients de la liste d'attente ne reçoivent **pas** de lien pour prendre eux-mêmes leur 1er RDV ; l'ortho le fixe. L'email « place libérée » garde `{lien}` vers l'espace patient. La case « Appliquer aussi ce délai aux liens envoyés par email » (`links_respect_notice`) ne concerne que les séances libérées proposées aux patients suivis.
- **Étape 4 — séances libérées** : toute séance à venir annulée (patient ou cabinet) ou avancée crée un `freed_slots`. À l'ouverture du Planning, pop-up **récapitulatif** : une ligne par créneau, bouton **Envoyer** (→ `start_slot_offer`), **Fermer** (si tout n'est pas envoyé : avertissement, puis les restants sont ignorés). Envoi par **vagues de 3** (`slot_offers` / `slot_offer_recipients`, lien `/creneau/<jeton>`), priorité : patients suivis sans RDV à venir, puis ceux dont le prochain RDV est plus tard (leur RDV est **avancé**, l'ancien créneau devient libéré à son tour). Jamais la liste d'attente. Premier arrivé, premier servi ; créneau repris / bloqué → « plus disponible ». **Rien entre 21 h et 8 h** ; vague suivante après **12 h** sans réponse (lancée à l'ouverture du planning et par la tâche du matin).
- **Rappel la veille** : la tâche du matin envoie un email pour chaque séance **confirmée** du lendemain (jour de Paris), patient actif, **avec l'adresse du cabinet** ; une seule fois (`appointments.reminder_sent_at`, remis à zéro si la séance est déplacée). RPC `cron_session_reminders`.
- **Adresse du cabinet obligatoire** (rue, code postal, ville), avec **saisie automatique** (`components/address-fields.tsx` → `/api/adresse` → Géoplateforme IGN / Base Adresse Nationale, gratuite, sans clé) : choisir une suggestion remplit code postal et ville, modifiables. Le serveur vérifie que l'adresse existe (`lib/address.ts`, rue connue dans la ville OU au code postal ; service en panne → accepté). Trigger `practices_require_address`.
- **Tâche planifiée** : Vercel Cron `/api/taches` chaque jour à 7 h UTC (`vercel.json`), protégée par `CRON_SECRET` (Vercel) dont l'empreinte est dans `private.app_secrets` (pas de clé Supabase secrète). Mise en place : `insert into private.app_secrets values ('cron', encode(sha256(convert_to('<le secret>', 'UTF8')), 'hex'));`
- **Annulation par l'ortho** : avec une **raison**, RDV gardé en `annule` / `cancelled_by = 'ortho'` (hors agenda), visible côté patient (« Annulée par le cabinet : … ») et dans l'email si « Prévenir le patient ».
- **Fin de prise en charge** : statut `termine` (« Prise en charge terminée », bouton dans l'onglet « Patients pris en charge », case « Afficher les prises en charge terminées »). La fiche patient est désactivée et le patient peut refaire une demande. Plus tard : passage automatique quand le nombre de séances de l'AMO est atteint.
- **États d'un RDV** (choix final de Tom) : **prévu** (à venir) → **réalisé** automatiquement quand l'heure est passée, sauf si l'ortho le marque **non honoré** (lapin, `appointments.attendance = 'absent'`, RPC `mark_attendance`, modifiable même après la date). **Annuler un RDV côté ortho = le supprimer** (`delete_appointment`). Durée : 30 min par défaut, l'ortho la change en cliquant sur la séance (plus de durée par acte AMO). Lapins comptés par patient (fiche + onglet « Patients pris en charge »).
- **Barre de progression** sur la fiche : séances réalisées (confirmées, passées, non « non honoré ») / séances prévues par l'acte AMO (`sessionsTotal`, **null en attendant la liste des actes de Tom** → barre hachurée + « total à définir »).
- **Agenda (v3)** : clic sur un créneau vide → pop-up à 2 onglets **« Planifier un rendez-vous »** (patient avec recherche — marche au doigt sur téléphone —, date, début, fin, titre privé, case « Prévenir le patient ») / **« Bloquer le créneau »**. Glisser un patient de la liste ouvre l'onglet RDV pré-rempli ; glisser un RDV ouvre une confirmation « Déplacer le rendez-vous ? » avec « Prévenir le patient du changement » (cochée ; email « Séance déplacée »). **Clic sur un patient de la liste = n'afficher que ses RDV** (blocages toujours visibles). Planning en pleine largeur (`.wrap` 1440 px).
- **Changement d'adresse email** (Mon compte) : `supabase.auth.updateUser({ email })` → lien de confirmation (modèle `supabase/templates/email-change.html`, à coller dans Supabase « Change Email Address ») → `/auth/confirm` → `/auth/email-modifie` qui **déconnecte tous les appareils** (`signOut({ scope: 'global' })`) → connexion avec la nouvelle adresse. **Une seule adresse partout (règle de Tom)** : plus de champ « Email de contact » dans le formulaire ; la base impose l'email du compte sur chaque demande (trigger `waitlist_account_email`) et le répercute sur demandes + fiches patients quand il change (trigger `on_auth_user_email_changed`).
- **Messages « c'est fait »** (`?ok=` / `?erreur=`) : affichés une seule fois, `components/clear-flash.tsx` les retire de l'adresse (un rechargement ne les remontre pas). **Menu** : Réglages toujours en dernier ; « Mon compte » est accessible depuis Réglages (carte en haut) et allume l'onglet Réglages ; côté famille, « Réglages » = Mon compte. **Prévenir le patient** ne se choisit plus dans la fiche : pop-up de confirmation à chaque « Planifier le rendez-vous », « Enregistrer » ou « Supprimer ce rendez-vous », avec la case (cochée ; emails « Nouvelle séance » / « Séance déplacée » / « Séance annulée »). Dépôt glissé sur une zone occupée : refusé, pop-up d'explication. Mon compte (ortho) : carte « Réglages du cabinet » en haut, comme la carte « Mon compte » des Réglages. Glisser-déposer : aperçu en pointillés de la zone visée avec ses heures (rouge si pris ou bloqué).
- **Chevauchements dans l'agenda** (séance annulée + nouveau RDV) : chaque élément reste **un seul bloc** ; les éléments liés par des chevauchements forment un groupe et se partagent la largeur en colonnes sur toute leur hauteur (`layoutPieces`, `lib/agenda.ts`). Arrivée de l'ortho après connexion : **le Planning**. Formulaire de RDV vérifié (patient, heures) **avant** la pop-up « Prévenir le patient ». Espace patient : « Mes séances » avec filtre Toutes (par défaut, annulées comprises) / Prévues / Passées / Annulées. Le délai minimum (case « liens par email ») s'applique aussi aux propositions de séances libérées (`private.offer_cutoff`).
- **Prévenir le patient** (`appointments.family_notice`) : email « Nouvelle séance » + pastille rouge « Nouveau » dans l'espace famille, qui part au clic sur « Lu » (`ack_appointment`).
- **Annulation par la famille** : raison facultative (`cancel_reason`, `cancelled_by = 'famille'`) ; côté ortho, fantôme en pointillés rouges dans l'agenda (ne bloque pas le créneau), clic → raison + « Retirer de l'agenda », et liste repliable « Annulations par les familles » au-dessus de l'agenda.
- **Réservation famille** : seuls les jours et horaires réservables s'affichent (futurs, après le délai minimum) ; « Demande de séance en cours » (non autonome, en attente) au lieu de « Séance déjà prévue ».
- **Fiche patient** = pop-up au clic sur un RDV du planning (identité, âge, aidant, contact cliquable, motif, type de demande, case « Patient autonome », emplacement « Acte AMO » à venir).
- **Réservation en ligne** (règle de Tom) : `practices.booking_mode` = ortho (personne ne réserve) / autonomes / tous, + délai minimum (`booking_min_notice_hours`, 24 h). Patient **autonome** → RDV confirmé tout de suite ; **non autonome** (mode « tous ») → `a_valider`, orange dans l'agenda, l'ortho **Accepte / Refuse** dans la fiche (email à la famille). Liste des autonomes dans Réglages + case sur la fiche, conservée quel que soit le mode.
- **Une seule séance à venir par patient pour réserver en ligne** : dès qu'une séance est prévue (réservée par la famille OU fixée par l'ortho, en attente ou confirmée), pas de nouvelle réservation tant qu'elle n'est pas passée ou annulée (`P0412`, `my_patients.active_booking`). **Règle de Tom : la limite est par patient ET par compte** : un compte peut inscrire Jean et Léa dans le même cabinet, mais pas Jean deux fois tant que sa demande est en attente, proposée ou suivie (`23505` dans `submit_waitlist_entry`, noms comparés sans casse). Un autre compte (autre email) peut inscrire un « Jean » homonyme sans problème. Sur `/c/<slug>`, simple rappel si le compte a déjà une demande ici ; l'annuaire affiche tous les cabinets (sauf le sien pour un ortho).
- **Espace famille** : le bouton **« Réserver une séance »** est sur la ligne de la demande « Pris en charge » concernée (patient + cabinet), seulement si l'ortho a ouvert la réservation pour ce patient ; « Séance déjà prévue » à la place s'il en a une à venir ; rien sinon (`my_patients.waitlist_entry_id`). Messages d'information en bleu : `Notice kind="info"` ; demandes **retirées** dans une section repliée « Demandes retirées », supprimables (poubelle, `delete_my_waitlist_entry`, statut `retire` seulement).
- **Côté famille** : `/patient` → « Mes séances » (confirmée / en attente de validation, annulation jusqu'au délai minimum, demande en attente retirable à tout moment) + « Réserver une séance pour X » → `/patient/reserver` (semaine par semaine, lundi–samedi, **7 h – 21 h** puisque le planning est « ouvert sauf blocages », jusqu'à 120 jours). Les familles ne voient que des plages occupées sans détail (`booking_busy`), jamais la table `appointments`. RPC : `book_appointment` (P0409 pris, P0411 délai / hors heures, P0412 demande déjà en attente), `family_cancel_appointment`, `my_appointments`, `my_patients`, `review_appointment`.
- **Durée des séances** : doit venir de l'acte AMO du patient (pas un choix de l'ortho). Plus besoin des durées par acte (l'ortho choisit). **Reste à recevoir de Tom : le nombre de séances par acte AMO** (total de la barre).
- Statut de la liste d'attente affiché en badge, avec boutons selon l'étape (« Place proposée » passe automatiquement à l'envoi de l'email).
- **Mon compte > Affichage** : interrupteur Français / English (cookie `langue`) et thème (cookie `theme`, `data-theme` sur `<html>` : system, light, dark, foret, sakura, exotique, ocean, lavande, nuit — couleurs dans `globals.css`, pastilles dans `compte/preferences.tsx`). Animations CSS légères, désactivées si « réduire les animations ». `loading.tsx` dans `/ortho` et `/patient`.
- **Traduction (toute l'app)** : façon gettext, le **texte français sert de clé** (`lib/i18n/core.ts`), l'anglais est dans `lib/i18n/en.ts`. Serveur : `const t = await getT()` ; client : `const t = useT()`. `Field`, `PasswordField`, `SubmitButton`, `Notice`, `FormAlert` traduisent eux-mêmes leurs textes (libellé, placeholder, erreur, message). Dates : `formatDay(…, short, t.locale)`, `formatTime(…, t.locale)`, `formatInstant`, `formatShortDate`. Textes par défaut (info liste d'attente, modèle d'email) : `waitlistInfoFor` / `emailTemplateFor` (version anglaise affichée si le texte est vide ou celui par défaut ; **les emails aux familles partent en français**, sauf modèle personnalisé).
- Changement de mot de passe : demande d'abord le code MFA si le compte en a un (Supabase exige aal2).
- Sessions orphelines (compte supprimé en partie, profil absent) : déconnexion propre + message.

## À faire (specs validées avec Tom)

0. **Bilan existant** (brainstorm) : pour « Rééducation uniquement », le bilan n'est **pas** envoyé pendant la liste d'attente ; il est demandé quand un RDV est fixé (upload dans l'espace patient, avec le module Documents).

Ordre proposé : Planning → Patients → Espace patient → Matériel → Trame CRBO → Comptabilité → Réglages complets.

1. **Planning** (ancien « Agenda ») — **terminé** (étapes 1, 2, 4 et rappel la veille ; 3 abandonnée).
   - Plages horaires ouvertes / bloquées (ponctuelles ou récurrentes). **Aucune plage bloquée au départ.**
   - Qui réserve en ligne, 3 modes : l'ortho seule / seulement les patients « autonomes » / tous les patients suivis.
   - Validation, 2 modes : l'ortho valide chaque réservation faite en ligne / confirmation automatique.
   - Patients autonomes : case sur la fiche patient + liste dans les Réglages. Bouton global « Tout le monde » / « Personne » ; avec « Personne », la liste de l'ortho reste active ; repasser en mode autonomes retrouve la liste.
   - Remplissage automatique des annulations : proposer le créneau libéré par vagues de 3 aux patients qui ont RDV plus tard et l'acceptent ; le premier qui accepte avance sa séance, son ancien créneau repart en cascade ; sinon → liste d'attente. Garde-fous : expiration des propositions, pas d'envoi la nuit, validation par l'ortho en option.
   - Le `{lien}` de l'email « place libérée » devient un lien personnel vers les créneaux ouverts (usage unique, expire en 72 h). Aujourd'hui il pointe vers `/patient`.
   - Rappels de séance : email la veille (SMS en option plus tard).
2. **Patients** : fiche (identité, aidants, prescripteur, date de prescription, motif), **acte AMO** (cotation, prix, durée, nombre de séances de la série), séances réalisées / prescrites, alerte de fin de série, notes de séance privées, documents, devoirs partagés, case « patient autonome ». Tarifs AMO au 23/02/2026 (FNO) : lettre clé **2,60 €**, ex. bilan langage écrit AMO 34,02 = 88,45 €, rééducation langage écrit AMO 11,6 = 30,16 €, articulation AMO 9,7 = 25,22 €, cognition math AMO 11,7 = 30,42 €, langage oral 3-6 ans AMO 12,6 = 32,76 €, neuro AMO 15,7 = 40,82 €. Durées et nombre de séances : à reprendre de la NGAP (non fournis par la FNO). Passer en « Pris en charge » depuis la liste d'attente devrait pouvoir créer la fiche patient.
3. **Espace patient (débloqué)** : séances à venir, réservation / déplacement / annulation selon les modes du planning (délai minimum réglable), propositions de créneaux libérés, exercices et documents reçus. Un compte parent gère plusieurs patients (fratrie).
4. **Matériel** : domaines (langage oral, écrit, articulation, déglutition, cognition math, voix…) + domaines ajoutés par l'ortho, import de ses propres supports (fichiers privés, stockés chiffrés), envoi d'un exercice à un patient (visible dans son espace). Plus tard : bibliothèque partagée (contenus originaux ou libres de droits uniquement).
5. **Trame CRBO** : sous-onglets par pathologie (même liste que la liste d'attente), une trame vierge par pathologie, import de sa propre trame ; créer un bilan copie la trame (la vierge reste intacte) ; génération d'un **PDF** avec le nom de l'app en en-tête (droite ou gauche) ; rangé dans le dossier patient.
6. **Comptabilité** : 2 sous-onglets. (1) Boutons « Ajouter revenus (AMO reçus) » jour / semaine / mois, « Ajouter dépenses » (fournitures, matériel, piles…), « Ajouter charges cabinet » (loyer, électricité…) + liste centrale avec calcul auto des +/- par jour / semaine / mois. (2) Graphiques jour / semaine / mois : courbes bénéfice, dépenses, chiffre d'affaires. Export CSV. Outil de suivi, pas un logiciel comptable certifié.
7. **Réglages complets** : langue, thème (clair / sombre / prédéfinis), liste des patients autonomes, plages horaires, modes de réservation, déconnexion.

## Plus tard / technique

- Nom de domaine + authentification dans Brevo (fin du warning « Non conforme », meilleure délivrabilité).
- CAPTCHA (Cloudflare Turnstile), vérification RPPS via l'API Annuaire Santé, codes de secours MFA, sauvegardes, test d'intrusion.
- Migration HDS : Supabase auto-hébergé ou Postgres + auth chez un hébergeur certifié HDS (Scaleway, OVHcloud, Clever Cloud, Scalingo), app hors Vercel. RGPD : AIPD, registre, contrats de sous-traitance, durées de conservation.
- Régénérer `database.types.ts` avec `npx supabase gen types typescript --project-id obidpbldenamwdqvtwyz`.

## Pièges déjà rencontrés

- **Règle de Tom : on n'est jamais bloqué sur une page.** Toute page sans menu a un bouton « ← Retour » (`components/back-button.tsx` : page précédente du site si elle existe — compteur `NavTracker` —, sinon une page de secours) ou une sortie (déconnexion).

- **Vocabulaire (Tom)** : côté ortho, on parle **du patient**, pas de « la famille » (le compte famille reste un détail technique). Limite anti-abus des réservations : 30 réussies / compte / jour (`booking-user`), atteinte vite en test → `select * from private.rate_limits` pour vérifier.

- **Tout nouveau texte affiché** passe par `t('…')` (ou un composant qui traduit) **et** sa version anglaise est ajoutée dans `lib/i18n/en.ts` : `src/lib/i18n.test.ts` échoue sinon. Texte avec variable : `t('Bonjour {nom}', { nom })`, jamais de concaténation.

- Supprimer un compte depuis la table `profiles` laisse l'utilisateur Auth sans profil : toujours supprimer via **Authentication > Users**.
- Nouveau projet Supabase Free : les modèles d'email ne sont modifiables qu'avec un SMTP personnalisé (d'où Brevo). Host SMTP : `smtp-relay.brevo.com` (une faute de frappe a déjà cassé l'inscription).
- Avec MFA activée, Supabase refuse de changer le mot de passe en aal1 (`insufficient_aal`).
- React 19 réinitialise les formulaires après une Server Action : pour garder les choix (listes, cases), utiliser des champs contrôlés ou une `key` qui recrée le formulaire avec les valeurs renvoyées.
- Le lien de confirmation connecte sans mot de passe : un mot de passe mal saisi à l'inscription ne se voit qu'à la reconnexion.
- Les modèles d'email Supabase utilisent `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=...` (le `RedirectTo` contient déjà `?next=`).

- Une contrainte `check ... not valid` est quand même revérifiée à **chaque update** de la ligne : une ancienne ligne non conforme bloque tout changement (ex. statut). Pour une règle sur une colonne que le client ne modifie pas, utiliser un trigger `before insert or update of <colonne>`.
- Brevo a deux clés : **SMTP** (`xsmtpsib-…`, pour Supabase Auth) et **API** (`xkeysib-…`, pour `BREVO_API_KEY` dans l'app). Les confondre = emails de l'app qui échouent alors que ceux d'auth passent.
- Un `update` bloqué par la RLS ne renvoie **pas d'erreur** (0 ligne) : toujours ajouter `.select('id')` et vérifier le nombre de lignes.

- Formulaires à plusieurs boutons (Accepter / Refuser, Supprimer ce jour / la série) : **un formulaire par bouton avec un champ caché**, ne pas compter sur le `name`/`value` du bouton cliqué ; côté serveur, une valeur absente n'est jamais interprétée comme « refuser » ou « tout supprimer ».

## Retours en attente

_(vide)_
