# CLAUDE.md

## Vue d'ensemble

« Mon Vocabulaire » : carnet de vocabulaire personnel fonctionnant **100 % hors ligne** en PWA (service worker + manifest).
Application de révision espacée **SM-2** : chaque mot porte son état d'apprentissage (répétitions consécutives, facteur de facilité, intervalle) et une prochaine révision programmée ; un **quiz chronométré** (« Jeu ») permet de réviser les mots arrivés à échéance. Un écran **Statistiques** (Paramètres) montre la progression (mots maîtrisés, série de jours, révisions) et des **notifications push** (Web Push via Supabase) relancent l'utilisateur même app fermée.

**Synchronisation** : depuis la V3, un compte Supabase (email + mot de passe) permet de synchroniser les données entre appareils. IndexedDB reste la source de vérité ; la sync est un bonus silencieux qui s'active en ligne. L'accès à l'app passe par un mur de connexion ; sans configuration Supabase (`config.js` en placeholder), l'app fonctionne en local sans compte.

**Stack** : HTML / CSS / JavaScript vanille, **aucun framework, aucun build, pas de `package.json`**. Seule dépendance : le SDK `@supabase/supabase-js` vendu en local (`js/vendor/supabase.min.js`).
Tout l'interface, le code et les commentaires sont en **français** (noms de variables : `mot`, `categorie`, `revision`, `quiz`…).

## Lancer l'application

Serveur statique simple depuis `vocab-app/` (les fichiers JS sont chargés par balises `<script>`, l'app a besoin d'un serveur HTTP pour IndexedDB et le service worker) :

```bash
# Python
python3 -m http.server 8123
# ou Node
node -e "require('http').createServer((q,s)=>{const f=require('fs'),p=require('path');let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';f.readFile(p.join(process.cwd(),u),(e,d)=>{if(e){s.writeHead(404);s.end();return;}s.writeHead(200,{'Content-Type':{'html':'text/html','js':'text/javascript','css':'text/css','json':'application/json','png':'image/png'}[p.extname(u).slice(1)]||'application/octet-stream'});s.end(d);});}).listen(8123)"
```

Puis ouvrir `http://127.0.0.1:8123/`.

Pour l'aperçu Freebuff, un helper sans dépendance existe à la racine du workspace : `node .freebuff/serveur-static.js` lancé depuis `vocab-app/` (voir `.freebuff/run.md`).

## Structure du projet

```
index.html            — écrans (sections .ecran) + bouton menu ☰ + tiroir de navigation
css/style.css         — styles (mobile-first, barre de nav en bas ; desktop : à gauche)
js/db.js              — accès IndexedDB, helpers de dates, catégories par défaut, soft delete
js/categories.js      — gestion des catégories (arbre, renommer, supprimer, sous-catégories)
js/mots.js            — liste des mots, recherche, fiche détail, formulaire ajout/édition
js/revision.js        — logique de révision (niveaux, seuils, liste « Révision classique »)
js/rappels.js         — notifications navigateur à l'ouverture (localStorage)
js/vocal.js           — dictée vocale (Web Speech API)
js/quiz.js            — quiz chronométré + accueil de l'onglet Jeu
js/export-import.js   — export/import JSON (fusion par ID)
js/statistiques.js    — écran Statistiques (Paramètres) : progression, série de jours, répartition
js/push.js            — abonnement Web Push (VAPID) + enregistrement dans Supabase
js/theme.js           — mode d'affichage clair/sombre/système (sélecteur Paramètres, anti-flash)
js/vendor/supabase.min.js — SDK supabase-js vendu localement (hors-ligne)
js/config.js          — configuration Supabase (URL + clé anon) — IGNORÉ par git
js/auth.js            — authentification Supabase (client, session, écran connexion, section Compte)
js/sync.js            — moteur de synchronisation (push/pull/fusion LWW, indicateurs UI)
js/app.js             — navigation (afficherEcran), initialisation, enregistrement SW
service-worker.js     — cache offline (cache-first, exclut supabase.co) + gestionnaires push/notificationclick — NOM_CACHE généré automatiquement
scripts/versionner-cache.js — génère le hash de NOM_CACHE (voir « Service worker »)
supabase/schema.sql   — script SQL à exécuter dans le projet Supabase (tables + RLS + push_subscriptions)
supabase/functions/envoyer-rappels/ — Edge Function Web Push (à déployer) + README + clé VAPID privée (gitignorée)
supabase/GUIDE-CONFIGURATION.md — guide pas à pas (création projet, clés, RLS, tests)
manifest.json         — PWA
icons/                — icônes PWA
```

### Ordre de chargement des scripts (critique)

Toutes les fonctions sont **globales** (pas de modules ES). L'ordre dans `index.html` est obligatoire :

`config.js` → `vendor/supabase.min.js` → `db.js` → `categories.js` → `mots.js` → `revision.js` → `rappels.js` → `vocal.js` → `quiz.js` → `export-import.js` → `auth.js` → `sync.js` → `app.js`

Une fonction d'un fichier appelée dans un autre ne doit être exécutée qu'au **runtime** (jamais au chargement).

## Mode sombre (theme.js + variables CSS)

- **Palette « Bleu ciel »** (cahier des charges `process/vocab-app/mode sombre/ETAPE-01-palette-couleurs.md`, validée) : bleu primaire `#2e9be6` clair / `#63c0f5` sombre, fond `#f3f8fc` / `#0b1720`, surface `#ffffff` / `#132430`, texte `#12232f` / `#eaf3f8`, bordure `#d7e6ee` / `#22384a`, danger `#d93025` / `#e5534b`. Primaire hover via `--couleur-primaire-hover` (`#2582c4` / `#7ecdf7`), appliqué aux boutons principaux (exclusion des boutons à fond propre via une longue liste `:not()`).
- Le thème est appliqué sur `<html data-theme="clair|sombre">` : toutes les couleurs passent par des **variables sémantiques** dans `:root` et `:root[data-theme='sombre']` de `css/style.css`. Un **script inline dans `<head>`** (index.html) applique le thème persisté avant le premier rendu pour éviter le flash clair.
- `js/theme.js` : choix persisté dans `localStorage` (`modeApparence` : `'system'` | `'clair'` | `'sombre'`, défaut `system` — suit alors `prefers-color-scheme`), sélecteur segmenté dans **Paramètres** (boutons `[data-theme-choix]`, classe `.active` + `aria-pressed`), suivi en direct du changement système, et `meta[name=theme-color]` adapté (`#f3f8fc` clair / `#0b1720` sombre).
- **Badges de niveau** (Étape 01 §3) : variables dédiées `--badge-nouveau-fond/-texte`, `--badge-en_cours-fond/-texte`, `--badge-acquis-fond/-texte` (clair : `#e4f1fa`/`#1d6fa5`, `#fdf2dc`/`#93650a`, `#e1f5ee`/`#0f6e56` ; sombre : `#1b3446`/`#7fc4f0`, `#3a2c10`/`#f0b84e`, `#123a2e`/`#5dcaa5`).
- **Boutons colorés** (évaluation de révision, quiz, barres) : variables dédiées avec variante sombre éclaircie + texte foncé dessus (`--couleur-facile`/`-difficile`/`-quiz`/`-quiz-hover`/`-progression`, texte via `--couleur-sur-primaire`) — le rouge `--couleur-danger` devient `#e5534b` en sombre.
- **Halos et bordures** : `--couleur-halo-focus` (focus des champs), `--couleur-bordure-info` / `--couleur-bordure-erreur` (statuts vocal/dictée) — bleus dérivés du primaire actuel.
- Règle : **aucune couleur en dur dans le CSS ni dans le JS** (sauf définitions dans `:root`) — toute nouvelle couleur passe par une variable sémantique.

## Navigation et écrans

- `afficherEcran(nomEcran)` (app.js) bascule la classe `.active` sur `#ecran-<nom>` et sur le bouton de menu `[data-ecran]`.
- Onglets : `liste`, `categories`, `ajout`, `revision` (libellé « Jeu »), `parametres`.
- **L'onglet Paramètres est un index de sections** : l'écran `parametres` n'affiche que la liste des sections (boutons `[data-section-parametres]` : compte, rappels, dictee, export, statistiques). Un clic ouvre un sous-écran `parametres-compte` / `parametres-rappels` / `parametres-dictee` / `parametres-export` / `parametres-statistiques` (sections `.ecran` à part, avec « ← Paramètres » = `[data-retour-parametres]`). Le menu garde « Paramètres » surligné pour ces sous-écrans (`SOUS_ECRANS_PARAMETRES` dans app.js). Les initialisations (`afficherZoneCompte`, `initialiserRappelsParametres`, `initialiserVocalParametres`, `afficherStatistiques`) s'exécutent à l'ouverture du sous-écran correspondant.
- **Il n'y a plus de barre d'onglets en bas** : la navigation passe par un **bouton hamburger `☰`** (`#btn-menu`, fixe en haut à gauche) qui ouvre un **tiroir latéral** (`#barre-navigation.menu-tiroir`, glisse depuis la gauche avec un voile assombri `#voile-menu`). Fonctions dans app.js : `ouvrirMenu()` / `fermerMenu()` / `basculerMenu()`.
- Le menu se ferme automatiquement après un clic sur une entrée, au clic sur le voile, à la touche Échap, ou via le bouton ✕ du tiroir.
- `#app` a un padding haut (~62 px) pour laisser la place au bouton menu fixe.
- `detail` est un **sous-écran** de l'onglet Liste (un appui sur un mot ouvre sa fiche ; le bouton « Modifier » ouvre le formulaire). Le menu garde « Liste » surligné pour `detail` (voir `nomEcranNav` dans app.js).
- Quitter l'écran `revision` appelle `arreterQuiz()` (arrêt du minuteur du quiz).
- **`connexion` est un écran dédié, sans navigation** : `afficherEcran` pose la classe `.sans-navigation` sur `<body>` quand `nomEcran === 'connexion'` ; le CSS masque le hamburger et le tiroir, et réduit les paddings de `#app`. Le menu est aussi fermé à l'entrée sur cet écran. La navigation réapparaît dès qu'on quitte l'écran.
- **La page de connexion est un mur de connexion** : à l'ouverture (Supabase configuré, aucune session), l'app démarre sur `connexion` et il n'existe **aucun autre accès** — pas de bouton retour, pas de mode invité, navigation masquée. Seule une authentification réussie (ou une session restaurée `INITIAL_SESSION`) ouvre l'application (Liste). La déconnexion (`SIGNED_OUT`) ramène sur la page de connexion. Sans configuration Supabase (`config.js` en placeholder), l'app démarre sur la Liste (aucun compte possible).

## Modèle de données (IndexedDB)

Base `vocabDB`, version 2. Accès via les helpers de `db.js` (ne jamais manipuler IndexedDB directement ailleurs).

### Store `mots` (keyPath `id`)
- `id` — UUID (`genererUUID()`)
- `mot`, `definition`, `exemple`, `langue`
- `categorieIds` — tableau d'ids (index `categorieIds`, multiEntry)
- `niveauMaitrise` — `'nouveau'` | `'en_cours'` | `'acquis'` (dérivé de l'état SM-2, voir revision.js)
- `repetition` — nombre de succès consécutifs (SM-2)
- `easeFacteur` — facteur de facilité (2.5 initial, plancher 1.3)
- `intervalleJours` — intervalle calculé (`null` = jamais calculé, mot « hérité » de l'ancien système)
- `prochaineRevision` — **« AAAA-MM-JJ »** (choix utilisateur, minuit local) **ou ISO** (évaluation automatique) ; `null` = automatique
- `dateCreation`, `dateModification` — ISO
- `historiqueRevision` — `[{ date: ISO, resultat: 'facile'|'difficile'|'echec' }]`
- `userId` — id Supabase du propriétaire (`null` = mode invité)
- `syncStatus` — `'en_attente'` | `'synchronise'`
- `supprime` — booléen (soft delete : les enregistrements supprimés restent en base tant qu'ils peuvent se propager)

### Store `categories` (keyPath `id`)
- `id` — UUID
- `nom`
- `parentId` — `null` = racine (index `parentId`)
- `estParDefaut` — booléen (3 catégories créées si le store est vide : « Étude Télécom », « Apprentissage », « Langue »)
- `dateCreation`, `dateModification`
- `userId`, `syncStatus`, `supprime` — comme `mots`

Helpers de dates partagés (db.js) : `parserDateRevision` (accepte les deux formats), `dateEnLocalAAJJMMJJ`, `valeurPourChampDate`, `valeurPourSelectDelai` (1..7 jours).

### localStorage (pas de store de paramètres)
- `rappelsActives` (`'true'`), `seuilRappelJours` (défaut 2), `langueDictee` (défaut `fr-FR`)
- `sync_dernier_pull_<userId>` — date ISO de la dernière récupération distante (pull)
- `sync_migre_<userId>` — `'1'` quand les données locales ont été migrées vers le compte

## Logique de révision — SM-2 (revision.js)

- **Algorithme SM-2** : `appliquerSM2(mot, resultat)` met à jour `repetition` (succès consécutifs, remis à 0 à l'échec), `easeFacteur` (2.5 initial, plancher 1.3 ; formule EF′ = EF + 0.1 − (5−q)×(0.08 + (5−q)×0.02) avec q=5 facile, 3 difficile, 1 échec) et `intervalleJours` (I(1)=1 j, I(2)=6 j, I(n)=arrondi(I(n−1)×EF)). Qualité ≥ 3 = succès (répétition +1).
- **Amorçage des mots « hérités »** (`amorcerEtatSM2`) : un mot sans `intervalleJours` (jamais évalué en SM-2) démarre depuis son ancien niveau (`nouveau`→0 répétition, `en_cours`→1, `acquis`→3) avec EF 2.5 et l'ancien seuil — transition sans à-coup.
- **Niveau de maîtrise dérivé** : 0 répétition → `nouveau`, 1-2 → `en_cours`, ≥ 3 → `acquis` (alimente les badges et filtres existants sans autre changement).
- `SEUILS_REVISION = { nouveau: 3, en_cours: 7, acquis: 14 }` : conservé uniquement comme **repli** pour les mots jamais programmés (et pour l'amorçage).
- `estAReviser(mot)` : une `prochaineRevision` programmée fait foi (atteinte/dépassée) ; sinon jamais révisé → vrai, ou dernière révision + seuil du niveau.
- `enregistrerEvaluation(mot, resultat)` : applique SM-2, ajoute à l'historique, met à jour `dateModification` et `prochaineRevision` (= maintenant + intervalle, ISO), persiste. **C'est la même fonction** pour la session individuelle (Révision classique) et le quiz — les données sont partagées.
- `selectionnerMotsAReviser(mots, idCategorie, categories)` : filtre catégorie (+ sous-catégories, via `obtenirIdsCategorieEtSousCategories`) puis mots à réviser.

## Statistiques (statistiques.js)

- Écran **Paramètres → Statistiques** (`parametres-statistiques`, index + sous-écran, `#zone-statistiques`). `afficherStatistiques()` calcule depuis les données locales (aucune écriture) : total de mots, mots maîtrisés (acquis + %), **série de jours** (`calculerSerieJours` — jours consécutifs avec ≥ 1 révision, en partant d'aujourd'hui ou d'hier si rien aujourd'hui), révisions totales / aujourd'hui, mots programmés, et répartition par niveau avec barres.

## Notifications push (Web Push)

- **Client** (`js/push.js`) : `abonnerPushSiPossible()` abonne le navigateur (`PushManager.subscribe`, clé VAPID publique de `js/config.js.vapidPublicKey`) et enregistre l'abonnement dans la table Supabase `push_subscriptions` (upsert sur `endpoint`). Conditions : Supabase configuré + VAPID + SW + PushManager + **permission `granted`** + **rappels activés** + utilisateur connecté. `desabonnerPush(userId)` désabonne et nettoie la table (appelé à la déconnexion et quand on désactive les rappels). Toujours non bloquant (console.warn en cas d'échec).
- **Service worker** : gestionnaires `push` (payload JSON `{title, body}` → `showNotification`) et `notificationclick` (focus fenêtre ouverte + `postMessage({type:'ouvrir-revision'})` → l'onglet Jeu s'ouvre, écouteur dans app.js ; sinon `clients.openWindow`).
- **Envoi** : Edge Function `supabase/functions/envoyer-rappels` (Deno, `npm:web-push`) — mots en retard (prochaine révision dépassée ≥ 2 jours), groupés par utilisateur, push via clés VAPID (env vars `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). **À déployer + planifier** (pg_cron ou cron externe) — voir `supabase/functions/envoyer-rappels/README.md`. La clé privée vit dans `supabase/functions/envoyer-rappels/vapid-prive.txt` (**gitignoré**, jamais commité).
- ⚠️ Table `push_subscriptions` + politiques RLS : bloc « V3.2 » de `supabase/schema.sql` (idempotent).

## Quiz / onglet « Jeu » (quiz.js)

- L'onglet affiche un **accueil** avec un bouton « 🎮 Lancer le quiz » (désactivé si aucun mot à réviser) + un lien « 📋 Révision classique » (liste de révision, filtre par catégorie, bouton 📅 de programmation). **Il n'y a plus d'écran de choix du nombre de mots** : le quiz démarre directement sur tous les mots à réviser, mélangés.
- Question : mot seul + compte à rebours 30 s → « J'ai fini » → révélation de la définition → « Je savais » (facile) / « Je ne savais pas » (echec) → score final.
- Garde anti double-clic : `quiz.repondu` (réinitialisé à chaque question dans `afficherQuestionQuiz`).
- `arreterQuiz()` : arrête le minuteur (appelé à la navigation ou au retour à l'accueil).

## Authentification (auth.js)

- Écran `connexion` : **mur de connexion** (Supabase configuré) — seule l'authentification donne accès à l'app. Il est aussi accessible depuis **Paramètres → Compte → « Se connecter / Créer un compte »** pour un changement de compte (après déconnexion, la page de connexion s'affiche d'office).
- **Design** : carte centrée (`connexion-carte`, max 440 px) avec en-tête logo 📖 + titre, champs pleine largeur, bouton principal pleine largeur et lien « Mot de passe oublié ? ». Aucun bouton d'échappement (ni retour, ni mode invité).
- **Onglets « Connexion / Inscription »** (`btn-onglet-connexion`, `btn-onglet-inscription`, `role=tablist`) : `definirModeConnexion('connexion'|'inscription')` bascule le libellé du bouton submit (« Se connecter » / « Créer mon compte »), l'`autocomplete` du mot de passe (`current-password`/`new-password`) et la visibilité du lien « Mot de passe oublié ?`. La soumission du formulaire route vers `seConnecter()` ou `sinscrire()` selon le mode actif (`modeConnexion`).
- **Session** : `onAuthStateChange` (SIGNED_IN / INITIAL_SESSION / SIGNED_OUT) ; `initialiserAuth()` peut être appelé plusieurs fois sans doublon d'écouteurs (garde `ecranConnexionBranche`). `obtenirClientSupabase()` expose le client à sync.js.
- **Session expirée vs déconnexion volontaire** : SIGNED_OUT survient dans les deux cas. `deconnexionExplicite` (posé par `seDeconnecter`) permet de distinguer : une expiration affiche « Votre session a expiré… » sur la page de connexion, une déconnexion volontaire renvoie au mur sans message.
- **Inscription** : si la confirmation d'email est requise dans le projet (`mailer_autoconfirm: false`), le compte est créé mais pas de session → message « Un email de confirmation vous a été envoyé », l'utilisateur reste sur l'écran. Les erreurs sont traduites en français (`erreurTraduite`).
- **Section Compte (Paramètres)** : badge « ✅ Email confirmé » / « ⚠️ Email non confirmé » (champ `emailConfirme` posé sur `utilisateurCourant` depuis `session.user.email_confirmed_at`), bouton **« Changer le mot de passe »** (formulaire inline `#form-changer-motdepasse` → `auth.updateUser({ password })`, validation locale 6 caractères + confirmation identique) et bouton **« Renvoyer l'email de confirmation »** (visible seulement si email non confirmé → `auth.resend({ type: 'signup' })`). Retours dans `#message-compte`.
- **Erreurs réseau** : se connecter nécessite internet (l'app hors-ligne, elle, n'en a pas besoin) — message clair dans ce cas.
- **`erreurTraduite()`** couvre : identifiants invalides, email déjà utilisé, mot de passe trop court, email non confirmé, email invalide, réseau, **rate limit** (429 → « Trop de tentatives… »), changement de mot de passe (même mot de passe), email déjà confirmé, et un repli générique pour les messages contenant « password ».

## Déploiement Vercel

- L'app est **100 % statique** (pas de build) : importer le dépôt sur Vercel avec **Root Directory = `vocab-app`**, framework « Other ».
- ⚠️ **`js/config.js` est gitignoré → il n'est PAS déployé par défaut** : en ligne, `/js/config.js` renvoie 404 et l'app affiche « Supabase n'est pas configuré » (pas d'auth/sync). Pour activer Supabase en ligne : retirer `js/config.js` du `.gitignore` et le committer — c'est sûr car la clé **anon** est publique par conception (seule la clé `service_role` doit rester secrète, jamais côté client).
- **Dans Supabase** (Authentication → URL Configuration) : Site URL = l'URL Vercel (`https://…vercel.app`) et Redirect URLs = `<URL>/**` — indispensable pour les liens de confirmation d'email et de réinitialisation.
- **Avant chaque push** : lancer `node scripts/versionner-cache.js` (ou `--check` pour vérifier sans écrire) pour régénérer `NOM_CACHE` — les utilisateurs reçoivent alors la nouvelle version (Vercel redéploie automatiquement au push si l'auto-deploy est actif).
- Guide complet : `supabase/GUIDE-CONFIGURATION.md`.

## Synchronisation Supabase (V3)

- **Principe local-first** : IndexedDB reste maître ; Supabase = sync/backup en arrière-plan. Aucun écran n'est imposé, l'app marche sans compte (mode invité) et sans config (`config.js` ignoré par git, placeholders).
- **Mise en place** : créer un projet Supabase, exécuter `supabase/schema.sql` (tables `mots`/`categories` + RLS), renseigner `js/config.js` (URL + clé anon).
- **Champs de sync** : `userId`, `syncStatus` (`en_attente`/`synchronise`), `supprime` (soft delete). `db.js` normalise automatiquement les écritures (`normaliserEnregistrement`) et déclenche `planifierSync()` (sync.js) après chaque écriture utilisateur.
- **Boucle push/pull** (sync.js) : push des `en_attente` (catégories avant mots, upsert `onConflict: 'id'`), puis pull des lignes modifiées depuis `sync_dernier_pull_<userId>` (paginé par 1000). Fusion LWW : la `dateModification` la plus récente gagne. **Crucial** : les écritures issues de la sync passent par `provenance: 'sync'` pour ne PAS remettre `en_attente` (sinon boucle push/pull infinie).
- **Suppression** : soft delete dès que l'enregistrement a un `userId` (physique sinon). Les tombstones sont filtrés de `obtenirTousLesMots`/`obtenirToutesLesCategories` par défaut (`inclureSupprimes: true` pour la sync).
- **Migration au premier login** (`associerDonneesAUtilisateur`) : pull initial → association des données `userId: null` → push → pull final. Les catégories par défaut du même nom déjà présentes sur le compte sont fusionnées (mots réassignés), les autres catégories sont conservées telles quelles.
- **Déclencheurs** : connexion, retour en ligne, réouverture, périodique 60 s (secours), différé 3 s après modification, et **Supabase Realtime** (voir ci-dessous). `navigator.onLine === false` → état `hors_ligne`, rien n'est tenté.
- **Temps réel (Supabase Realtime)** : `demarrerRealtime(userId)` (sync.js) abonne un canal `sync-<userId>` aux événements `postgres_changes` (`*`) sur les tables `mots` et `categories` filtrés par `user_id=eq.<userId>`. Chaque événement déclenche une `synchroniser()` **anti-rafale** (debounce 800 ms) — on ne lit pas le payload, on re-pull tout. `arreterRealtime()` ferme le canal (déconnexion, changement d'utilisateur) ; relance sur retour en ligne et, à chaque tick périodique, si le canal n'est plus actif (`realtimeActif`). **Le polling 60 s reste le secours** (canal coupé, table non publiée, hors ligne).
- ⚠️ **Publication Realtime obligatoire côté Supabase** : par défaut les tables ne sont PAS dans la publication `supabase_realtime` → aucun événement n'arrive (le canal se connecte, `SUBSCRIBED`, mais rien ne tombe — diagnostic : `clientSupabase.realtime.getChannels()` → `subscriptions` vide, et aucun pull après un changement REST direct). Le `schema.sql` inclut maintenant le bloc `alter publication supabase_realtime add table public.mots/categories;` (idempotent via `pg_publication_tables`) à exécuter **une fois** (ou Database → Replication dans le dashboard). Sans ça, seule la sync périodique 60 s fonctionne.
- **Rafraîchissement de l'écran après pull** : `tirerChangements()` retourne le nombre d'enregistrements appliqués ; si > 0, `rafraichirEcranApresSync()` re-rend la Liste (en conservant la recherche, `afficherListeMots` relit `#champ-recherche`) ou les Catégories et met à jour l'indicateur. Ne touche jamais l'écran détail / quiz en cours / formulaire.
- **Indicateurs UI** : `#indicateur-sync` (en-tête Liste, discret) + `#zone-statut-sync` (Paramètres). `mettreAJourIndicateurSync()` (sync.js) gère les deux.
- **Ordre auth → sync** : `auth.js` pose la session et appelle `migrerEtSynchroniser()`/`demarrerSyncPourUtilisateur()` ; `sync.js` ne fait rien sans `obtenirUtilisateurCourant()`.

## Service worker

- Stratégie cache-first ; navigation servie depuis `index.html` en cache.
- **Les requêtes vers `*.supabase.co` ne sont JAMAIS interceptées** (ni cache, ni service depuis le cache) — sinon la PWA servirait des données/sessions périmées.
- **Le nom du cache est généré automatiquement** par `scripts/versionner-cache.js` : hash SHA-256 (préfixe 12 hex) du contenu des fichiers de `FICHIERS_A_CACHER`, injecté dans `NOM_CACHE` entre les marqueurs `// >>> CACHE_VERSION_AUTOMATIQUE` / `// >>> FIN_CACHE_VERSION_AUTOMATIQUE`. Toute modification d'un fichier de l'app change le hash → nouveau nom de cache → re-téléchargement chez les utilisateurs (l'ancien cache est supprimé à l'activation).
- **Workflow** : après chaque modification des fichiers de l'app (y compris `index.html`), lancer `node scripts/versionner-cache.js` avant commit/push. Le mode `--check` est utile avant push/CI : exit 1 si le hash est périmé. Ne pas modifier à la main les zones entre marqueurs `>>> …` (le script les réécrit).
- **Ne pas ajouter de fichier au cache sans le mettre dans `FICHIERS_A_CACHER`** (entre `// >>> LISTE_FICHIERS_A_CACHER` / `// >>> FIN_LISTE_FICHIERS_A_CACHER`) : le script hache exactement cette liste.
- **Pourquoi pas un hash calculé dans le service worker lui-même ?** Le navigateur ne réinstalle le SW que si son fichier change (comparaison d'octets à chaque navigation). Un hash calculé uniquement au runtime ne serait jamais recalculé si `service-worker.js` reste identique. Le script garantit que le SW change de contenu dès qu'un fichier change → mise à jour fiable sans build.

## Conventions de code

- **Tout en français** : textes d'interface, commentaires, noms de fonctions/variables.
- Fonctions globales déclarées avec `function` ; docstrings JSDoc `/** … */` au-dessus de chaque fonction.
- IDs d'éléments DOM en français (`champ-recherche`, `liste-mots`, `contenu-revision`…).
- Pas de librairies externes ; réutiliser les helpers existants (ex. `remplirOptionsFiltreCategorie` pour tout sélecteur d'arbre de catégories).
- Éléments dynamiques construits en JS pur (`document.createElement`) ; les écrans statiques sont dans `index.html`.

## Tests

- **Aucun framework de test** : vérifier la syntaxe avec `node --check js/*.js`.
- Tests manuels dans un navigateur via un serveur statique (voir « Lancer l'application »).
- Après un changement, tester au minimum : chargement sans erreur console, ajout/édition/suppression d'un mot, navigation entre onglets, quiz complet, ajout de catégorie.
- Pour l'auth : vérifier que la barre de navigation disparaît sur l'écran `connexion` et réapparaît au retour, la bascule Connexion/Inscription, les messages d'erreur, et le flux complet (connexion → migration → « ☁️ À jour » → déconnexion).
- Révision SM-2 : vérifier la progression des intervalles (1 j → 6 j → ×EF), la remise à zéro à l'échec et l'amorçage des anciens mots — testable en console avec `appliquerSM2(mot, resultat)`.
- Statistiques : ouvrir Paramètres → Statistiques et contrôler cartes + répartition (les données viennent de l'historique réel).
- Données de test : supprimer la base avec les devtools (Application → IndexedDB → `vocabDB`) pour repartir de zéro (les catégories par défaut sont recréées à l'ouverture).

## Pièges connus

- **Ordre de chargement des scripts** : ne pas exécuter de fonction d'un fichier chargé plus tard au moment du chargement d'un fichier antérieur.
- `afficherEcran('revision')` peut être appelé depuis une notification (d'ouverture ou push) → affiche l'accueil du Jeu (le quiz), pas la liste.
- La fiche détail (`detail`) recharge le mot à chaque ouverture ; `motEnDetailId` sert au bouton « Modifier ».
- La dictée vocale (Web Speech API) n'est pas supportée partout (ex. Firefox) : les boutons micro et le réglage sont masqués si l'API est absente (géré dans `vocal.js`).
- Le filtre par catégorie n'existe plus dans l'onglet Liste (déplacé avec la gestion des catégories dans l'onglet « Catégories ») ; le seul filtre restant est celui de l'écran « Révision classique » (`filtre-categorie-revision`).
- Export/import JSON : fusion par ID, la version la plus récente (`dateModification`) gagne ; les catégories sont importées avant les mots. À l'import, `userId` est réattribué à l'utilisateur qui importe et les données repassent en `en_attente`.
- **Ne jamais contourner `provenance: 'sync'`** pour une écriture issue de la synchronisation : `modifierMot`/`modifierCategorie` sans provenance repassent l'enregistrement en `en_attente` et redéclenchent une sync (boucle).
- Un enregistrement supprimé (`supprime: true`) reste en IndexedDB (tombstone) tant qu'il peut se propager — c'est voulu : sans lui, la suppression ne pourrait pas atteindre les autres appareils.
- Multi-comptes sur un même appareil : les données d'un compte restent associées à leur `userId` après déconnexion et ne sont PAS poussées vers un autre compte (pas de fuite de données, mais l'utilisateur doit savoir que chaque compte garde ses données).
- **L'aperçu local peut rester sur l'ancienne version** : le service worker sert la page en cache (cache-first). Après une modification, purger les caches et désenregistrer le SW depuis la console (`caches.keys()`, `navigator.serviceWorker.getRegistrations()`) puis recharger — ou simplement incrémenter `NOM_CACHE`.
- **Tester le flux d'auth sans compte réel** : `clientSupabase` et `utilisateurCourant` sont des bindings globaux réassignables depuis la console — on peut injecter un faux client (méthodes `auth.getSession/onAuthStateChange/signInWithPassword/signUp/signOut` + `from().upsert()/select()`) et rejouer `initialiserAuth()` pour passer tout le flux (migration, push/pull, UI) sans réseau. Ne pas oublier de nettoyer (`localStorage`, `sync_migre_*`, base) ensuite.
- **Le projet Supabase de production exige la confirmation d'email** (`mailer_autoconfirm: false`) : une inscription crée un compte non confirmé sans session — tester la connexion nécessite de cliquer le lien de l'email (Site URL doit pointer vers l'app).
- **SM-2 et colonnes serveur** : le client pousse `repetition`/`ease_facteur`/`intervalle_jours`. Si le bloc « V3.2 » de `schema.sql` n'a pas été exécuté sur le projet, l'upsert échoue (colonne inexistante) → état `erreur` de sync. Exécuter le SQL **en même temps** que le déploiement du nouveau client.
- **Push non testable en automatisation** : la souscription réelle exige une permission navigateur (prompt OS) qu'on ne peut pas cliquer programmatiquement. En environnement sans push service, `PushManager.subscribe` échoue → `abonnerPushSiPossible` retourne false proprement. Le test complet se fait à la main (permission + SQL + fonction déployée).
- **Realtime ne remonte jamais les changements si la table n'est pas dans la publication `supabase_realtime`** — vérifier le `schema.sql` (bloc ALTER PUBLICATION) avant de chercher un bug dans sync.js. Le canal se connecte quand même (`SUBSCRIBED`), c'est ce qui rend le diagnostic piégeux.
