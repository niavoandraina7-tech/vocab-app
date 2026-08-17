# CLAUDE.md

## Vue d'ensemble

« Mon Vocabulaire » : carnet de vocabulaire personnel fonctionnant **100 % hors ligne** en PWA (service worker + manifest).
Application de révision espacée : les mots ont un niveau de maîtrise (`nouveau`, `en_cours`, `acquis`) et une prochaine révision programmée ; un **quiz chronométré** (« Jeu ») permet de réviser les mots arrivés à échéance.

**Synchronisation optionnelle** : depuis la V3, un compte Supabase (email + mot de passe) permet de synchroniser les données entre appareils. IndexedDB reste la source de vérité ; la sync est un bonus silencieux qui s'active en ligne. L'app reste utilisable sans compte (mode invité) et sans configuration.

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
js/rappels.js         — bandeau de rappel + notifications navigateur (localStorage)
js/vocal.js           — dictée vocale (Web Speech API)
js/quiz.js            — quiz chronométré + accueil de l'onglet Jeu
js/export-import.js   — export/import JSON (fusion par ID)
js/config.js          — configuration Supabase (URL + clé anon) — IGNORÉ par git
js/auth.js            — authentification Supabase (client, session, écran connexion, section Compte)
js/sync.js            — moteur de synchronisation (push/pull/fusion LWW, indicateurs UI)
js/vendor/supabase.min.js — SDK supabase-js vendu localement (hors-ligne)
js/app.js             — navigation (afficherEcran), initialisation, enregistrement SW
service-worker.js     — cache offline (cache-first, exclut supabase.co)
supabase/schema.sql   — script SQL à exécuter dans le projet Supabase (tables + RLS)
supabase/GUIDE-CONFIGURATION.md — guide pas à pas (création projet, clés, RLS, tests)
manifest.json         — PWA
icons/                — icônes PWA
```

### Ordre de chargement des scripts (critique)

Toutes les fonctions sont **globales** (pas de modules ES). L'ordre dans `index.html` est obligatoire :

`config.js` → `vendor/supabase.min.js` → `db.js` → `categories.js` → `mots.js` → `revision.js` → `rappels.js` → `vocal.js` → `quiz.js` → `export-import.js` → `auth.js` → `sync.js` → `app.js`

Une fonction d'un fichier appelée dans un autre ne doit être exécutée qu'au **runtime** (jamais au chargement).

## Navigation et écrans

- `afficherEcran(nomEcran)` (app.js) bascule la classe `.active` sur `#ecran-<nom>` et sur le bouton de menu `[data-ecran]`.
- Onglets : `liste`, `categories`, `ajout`, `revision` (libellé « Jeu »), `parametres`.
- **L'onglet Paramètres est un index de sections** : l'écran `parametres` n'affiche que la liste des sections (boutons `[data-section-parametres]` : compte, rappels, dictee, export). Un clic ouvre un sous-écran `parametres-compte` / `parametres-rappels` / `parametres-dictee` / `parametres-export` (sections `.ecran` à part, avec « ← Paramètres » = `[data-retour-parametres]`). Le menu garde « Paramètres » surligné pour ces sous-écrans (`SOUS_ECRANS_PARAMETRES` dans app.js). Les initialisations (`afficherZoneCompte`, `initialiserRappelsParametres`, `initialiserVocalParametres`) s'exécutent à l'ouverture du sous-écran correspondant.
- **Il n'y a plus de barre d'onglets en bas** : la navigation passe par un **bouton hamburger `☰`** (`#btn-menu`, fixe en haut à gauche) qui ouvre un **tiroir latéral** (`#barre-navigation.menu-tiroir`, glisse depuis la gauche avec un voile assombri `#voile-menu`). Fonctions dans app.js : `ouvrirMenu()` / `fermerMenu()` / `basculerMenu()`.
- Le menu se ferme automatiquement après un clic sur une entrée, au clic sur le voile, à la touche Échap, ou via le bouton ✕ du tiroir.
- `#app` a un padding haut (~62 px) pour laisser la place au bouton menu fixe.
- `detail` est un **sous-écran** de l'onglet Liste (un appui sur un mot ouvre sa fiche ; le bouton « Modifier » ouvre le formulaire). Le menu garde « Liste » surligné pour `detail` (voir `nomEcranNav` dans app.js).
- Quitter l'écran `revision` appelle `arreterQuiz()` (arrêt du minuteur du quiz).
- **`connexion` est un écran dédié, sans navigation** : `afficherEcran` pose la classe `.sans-navigation` sur `<body>` quand `nomEcran === 'connexion'` ; le CSS masque le hamburger et le tiroir, et réduit les paddings de `#app`. Le menu est aussi fermé à l'entrée sur cet écran. La navigation réapparaît dès qu'on quitte l'écran.
- **La page de connexion s'affiche en premier à l'ouverture** : dans app.js, si Supabase est configuré et qu'aucune session n'est restaurée au chargement, l'app démarre sur `connexion`. Une session restaurée (`INITIAL_SESSION`) ouvre directement la Liste ; « Continuer sans compte » entre en mode invité (Liste) ; la déconnexion (`SIGNED_OUT`) ramène sur la page de connexion. « ← Retour » repart vers Paramètres si l'écran a été ouvert depuis la section Compte, sinon vers la Liste (`cibleRetourConnexion` dans auth.js).

## Modèle de données (IndexedDB)

Base `vocabDB`, version 2. Accès via les helpers de `db.js` (ne jamais manipuler IndexedDB directement ailleurs).

### Store `mots` (keyPath `id`)
- `id` — UUID (`genererUUID()`)
- `mot`, `definition`, `exemple`, `langue`
- `categorieIds` — tableau d'ids (index `categorieIds`, multiEntry)
- `niveauMaitrise` — `'nouveau'` | `'en_cours'` | `'acquis'`
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

## Logique de révision (revision.js)

- `SEUILS_REVISION = { nouveau: 3, en_cours: 7, acquis: 14 }` (jours).
- `estAReviser(mot)` : une `prochaineRevision` programmée fait foi (atteinte/dépassée) ; sinon jamais révisé → vrai, ou dernière révision + seuil du niveau.
- `calculerNouveauNiveau` : `echec` → `nouveau`, `difficile` → `en_cours`, `facile` → monte d'un cran (`nouveau`→`en_cours`, `en_cours`→`acquis`, `acquis` reste).
- `enregistrerEvaluation(mot, resultat)` : met à jour niveau, `prochaineRevision` (= maintenant + seuil du nouveau niveau, ISO) et l'historique. **C'est la même fonction** pour la session individuelle (Révision classique) et le quiz — les données sont partagées.
- `selectionnerMotsAReviser(mots, idCategorie, categories)` : filtre catégorie (+ sous-catégories, via `obtenirIdsCategorieEtSousCategories`) puis mots à réviser.

## Quiz / onglet « Jeu » (quiz.js)

- L'onglet affiche un **accueil** avec un bouton « 🎮 Lancer le quiz » (désactivé si aucun mot à réviser) + un lien « 📋 Révision classique » (liste de révision, filtre par catégorie, bouton 📅 de programmation). **Il n'y a plus d'écran de choix du nombre de mots** : le quiz démarre directement sur tous les mots à réviser, mélangés.
- Question : mot seul + compte à rebours 30 s → « J'ai fini » → révélation de la définition → « Je savais » (facile) / « Je ne savais pas » (echec) → score final.
- Garde anti double-clic : `quiz.repondu` (réinitialisé à chaque question dans `afficherQuestionQuiz`).
- `arreterQuiz()` : arrête le minuteur (appelé à la navigation ou au retour à l'accueil).

## Authentification (auth.js)

- Écran `connexion` affiché **au démarrage de l'app** (si Supabase est configuré et sans session restaurée) et accessible depuis **Paramètres → Compte → « Se connecter / Créer un compte »**. Le mode invité reste possible via « Continuer sans compte » : ce n'est pas un mur de connexion bloquant.
- **Design** : carte centrée (`connexion-carte`, max 440 px) avec en-tête logo 📖 + titre, champs pleine largeur, bouton principal pleine largeur, lien « Mot de passe oublié ? » et bouton discret « Continuer sans compte ».
- **Onglets « Connexion / Inscription »** (`btn-onglet-connexion`, `btn-onglet-inscription`, `role=tablist`) : `definirModeConnexion('connexion'|'inscription')` bascule le libellé du bouton submit (« Se connecter » / « Créer mon compte »), l'`autocomplete` du mot de passe (`current-password`/`new-password`) et la visibilité du lien « Mot de passe oublié ?`. La soumission du formulaire route vers `seConnecter()` ou `sinscrire()` selon le mode actif (`modeConnexion`).
- **Session** : `onAuthStateChange` (SIGNED_IN / INITIAL_SESSION / SIGNED_OUT) ; `initialiserAuth()` peut être appelé plusieurs fois sans doublon d'écouteurs (garde `ecranConnexionBranche`). `obtenirClientSupabase()` expose le client à sync.js.
- **Inscription** : si la confirmation d'email est requise dans le projet (`mailer_autoconfirm: false`), le compte est créé mais pas de session → message « Un email de confirmation vous a été envoyé », l'utilisateur reste sur l'écran. Les erreurs sont traduites en français (`erreurTraduite`).
- **Erreurs réseau** : se connecter nécessite internet (l'app hors-ligne, elle, n'en a pas besoin) — message clair dans ce cas.

## Déploiement Vercel

- L'app est **100 % statique** (pas de build) : importer le dépôt sur Vercel avec **Root Directory = `vocab-app`**, framework « Other ».
- ⚠️ **`js/config.js` est gitignoré → il n'est PAS déployé par défaut** : en ligne, `/js/config.js` renvoie 404 et l'app affiche « Supabase n'est pas configuré » (pas d'auth/sync). Pour activer Supabase en ligne : retirer `js/config.js` du `.gitignore` et le committer — c'est sûr car la clé **anon** est publique par conception (seule la clé `service_role` doit rester secrète, jamais côté client).
- **Dans Supabase** (Authentication → URL Configuration) : Site URL = l'URL Vercel (`https://…vercel.app`) et Redirect URLs = `<URL>/**` — indispensable pour les liens de confirmation d'email et de réinitialisation.
- **Avant chaque push** : incrémenter `NOM_CACHE` dans `service-worker.js` (actuellement **v21**) pour que les utilisateurs reçoivent la nouvelle version (Vercel redéploie automatiquement au push si l'auto-deploy est actif).
- Guide complet : `supabase/GUIDE-CONFIGURATION.md`.

## Synchronisation Supabase (V3)

- **Principe local-first** : IndexedDB reste maître ; Supabase = sync/backup en arrière-plan. Aucun écran n'est imposé, l'app marche sans compte (mode invité) et sans config (`config.js` ignoré par git, placeholders).
- **Mise en place** : créer un projet Supabase, exécuter `supabase/schema.sql` (tables `mots`/`categories` + RLS), renseigner `js/config.js` (URL + clé anon).
- **Champs de sync** : `userId`, `syncStatus` (`en_attente`/`synchronise`), `supprime` (soft delete). `db.js` normalise automatiquement les écritures (`normaliserEnregistrement`) et déclenche `planifierSync()` (sync.js) après chaque écriture utilisateur.
- **Boucle push/pull** (sync.js) : push des `en_attente` (catégories avant mots, upsert `onConflict: 'id'`), puis pull des lignes modifiées depuis `sync_dernier_pull_<userId>` (paginé par 1000). Fusion LWW : la `dateModification` la plus récente gagne. **Crucial** : les écritures issues de la sync passent par `provenance: 'sync'` pour ne PAS remettre `en_attente` (sinon boucle push/pull infinie).
- **Suppression** : soft delete dès que l'enregistrement a un `userId` (physique sinon). Les tombstones sont filtrés de `obtenirTousLesMots`/`obtenirToutesLesCategories` par défaut (`inclureSupprimes: true` pour la sync).
- **Migration au premier login** (`associerDonneesAUtilisateur`) : pull initial → association des données `userId: null` → push → pull final. Les catégories par défaut du même nom déjà présentes sur le compte sont fusionnées (mots réassignés), les autres catégories sont conservées telles quelles.
- **Déclencheurs** : connexion, retour en ligne, réouverture, périodique 60 s, différé 3 s après modification. `navigator.onLine === false` → état `hors_ligne`, rien n'est tenté.
- **Indicateurs UI** : `#indicateur-sync` (en-tête Liste, discret) + `#zone-statut-sync` (Paramètres). `mettreAJourIndicateurSync()` (sync.js) gère les deux.
- **Ordre auth → sync** : `auth.js` pose la session et appelle `migrerEtSynchroniser()`/`demarrerSyncPourUtilisateur()` ; `sync.js` ne fait rien sans `obtenirUtilisateurCourant()`.

## Service worker

- Stratégie cache-first ; navigation servie depuis `index.html` en cache.
- **Les requêtes vers `*.supabase.co` ne sont JAMAIS interceptées** (ni cache, ni service depuis le cache) — sinon la PWA servirait des données/sessions périmées.
- **Quand on modifie un fichier de l'app, incrémenter `NOM_CACHE`** (actuellement `vocab-cache-v21`) pour forcer le re-téléchargement chez les utilisateurs. Sans ça, la PWA continue de servir l'ancienne version.

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
- Données de test : supprimer la base avec les devtools (Application → IndexedDB → `vocabDB`) pour repartir de zéro (les catégories par défaut sont recréées à l'ouverture).

## Pièges connus

- **Ordre de chargement des scripts** : ne pas exécuter de fonction d'un fichier chargé plus tard au moment du chargement d'un fichier antérieur.
- `afficherEcran('revision')` peut être appelé depuis le bandeau de rappel ou une notification → affiche l'accueil du Jeu (le quiz), pas la liste.
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
