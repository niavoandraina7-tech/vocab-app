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

## Structure du projet

```
index.html            — écrans (sections .ecran) + barre de navigation
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
manifest.json         — PWA
icons/                — icônes PWA
```

### Ordre de chargement des scripts (critique)

Toutes les fonctions sont **globales** (pas de modules ES). L'ordre dans `index.html` est obligatoire :

`config.js` → `vendor/supabase.min.js` → `db.js` → `categories.js` → `mots.js` → `revision.js` → `rappels.js` → `vocal.js` → `quiz.js` → `export-import.js` → `auth.js` → `sync.js` → `app.js`

Une fonction d'un fichier appelée dans un autre ne doit être exécutée qu'au **runtime** (jamais au chargement).

## Navigation et écrans

- `afficherEcran(nomEcran)` (app.js) bascule la classe `.active` sur `#ecran-<nom>` et sur le bouton de nav `[data-ecran]`.
- Onglets : `liste`, `categories`, `ajout`, `revision` (libellé « Jeu »), `parametres`.
- `detail` est un **sous-écran** de l'onglet Liste (un appui sur un mot ouvre sa fiche ; le bouton « Modifier » ouvre le formulaire). La barre de nav garde « Liste » surligné pour `detail` (voir `nomEcranNav` dans app.js).
- Quitter l'écran `revision` appelle `arreterQuiz()` (arrêt du minuteur du quiz).

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
- **Quand on modifie un fichier de l'app, incrémenter `NOM_CACHE`** (`vocab-cache-v8` → v9, …) pour forcer le re-téléchargement chez les utilisateurs. Sans ça, la PWA continue de servir l'ancienne version.

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
