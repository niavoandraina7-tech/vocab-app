# Guide pas à pas : configurer Supabase pour « Mon Vocabulaire »

> Suis ces étapes dans l'ordre. La partie technique (code) est déjà faite —
> il ne reste que la configuration du projet Supabase et de `js/config.js`.

---

## Étape 1 — Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) et connecte-toi (GitHub ou email).
2. Clique sur **New project**.
3. Renseigne :
   - **Name** : par exemple `mon-vocabulaire`
   - **Database Password** : crée un mot de passe fort (stocké, ne le perds pas)
   - **Region** : la région la plus proche de tes utilisateurs (ex : `eu-central-1` pour l'Europe)
4. Clique sur **Create new project** et attends la fin de la création (1 à 2 minutes).

---

## Étape 2 — Activer l'authentification email / mot de passe

1. Dans le menu de gauche : **Authentication** → **Sign In / Providers**.
2. Sur la ligne **Email**, clique sur l'icône ✏️ (ou clique sur la ligne).
3. Active **Enable Sign up with Email**.
4. **Confirm email** : laisse-le **activé** (recommandé) — l'app gère les deux cas :
   - activé → l'utilisateur reçoit un email de confirmation à sa première inscription ;
   - désactivé → la session est créée immédiatement.
5. Enregistre.

> Optionnel : dans **Authentication** → **URL Configuration** → **Site URL**, mets
> `http://127.0.0.1:8123` pour tes tests locaux (utile pour les liens de
> confirmation email et de réinitialisation de mot de passe).

---

## Étape 3 — Créer les tables (SQL Editor)

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Colle **tout le contenu** du fichier `supabase/schema.sql` du projet.
3. Clique sur **Run** (ou `Ctrl/Cmd + Entrée`).
4. Vérifie en bas qu'il n'y a **aucune erreur** (4 tables créées + 8 policies RLS + 4 index).

> Le script crée les tables `mots` et `categories`, active la sécurité par ligne
> (RLS : chaque utilisateur ne voit que ses propres données) et les index de sync.

---

## Étape 4 — Récupérer les clés et les mettre dans l'app

1. Dans le menu de gauche : **Project Settings** → **API**.
2. Copie deux valeurs :
   - **Project URL** (ex : `https://abcdefgh.supabase.co`)
   - **anon public key** (longue chaîne commençant par `eyJ...`)
3. Ouvre `js/config.js` du projet et remplace les placeholders :

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://TON-PROJET.supabase.co',
     anonKey: 'TA_CLE_ANON_PUBLIQUE_ICI'
   };
   ```

   ⚠️ **N'utilise JAMAIS la clé `service_role` côté client** — elle contourne la
   sécurité RLS et ne doit exister que côté serveur. Seule la clé **anon** va dans l'app.
4. ⚠️ **Important PWA** : `js/config.js` est mis en cache par le service worker.
   Après l'avoir modifié, **incrémente `NOM_CACHE`** dans `service-worker.js`
   (`vocab-cache-v9` → `vocab-cache-v10`) pour forcer la nouvelle version à se charger.

---

## Étape 5 — Tester la connexion et la synchronisation

1. Lance l'app (serveur statique, ex : `python3 -m http.server 8123` depuis `vocab-app/`).
2. Ouvre **Paramètres** → **Compte & Synchronisation** : le message
   « Supabase n'est pas encore configuré » doit avoir disparu, remplacé par
   **« Se connecter / Créer un compte »**.
3. Clique sur **Se connecter / Créer un compte** → **Créer un compte** :
   - saisis email + mot de passe (6 caractères minimum) ;
   - si la confirmation email est activée : ouvre l'email reçu et clique le lien ;
   - reconnecte-toi.
4. Vérifie l'**indicateur de synchronisation** en haut de l'écran Liste :
   - « 📤 X modification(s) à synchroniser » puis « ☁️ À jour » après quelques secondes.
5. Ajoute un mot, attends 3-5 secondes : il doit apparaître dans la table `mots`
   de Supabase (**Table Editor**), avec ton `user_id`.

---

## Étape 6 — Vérifier la sécurité (recommandé)

1. Ouvre l'app dans un **autre navigateur ou profil** (ou en navigation privée).
2. Crée un **deuxième compte** et connecte-toi.
3. Vérifie que tu **ne vois pas** les mots du premier compte (la liste est vide
   ou ne contient que ce que ce 2ᵉ compte a créé).
4. Dans **Table Editor**, vérifie que chaque ligne a bien son `user_id` propre.

> C'est la validation « utilisateur A ne voit pas les données de l'utilisateur B »
> demandée par le plan (étapes 02 et 08).

---

## Synchroniser entre deux appareils

1. Sur le 2ᵉ appareil, connecte-toi avec le **même compte**.
2. La première connexion tire les données du compte (pull initial) puis pousse
   les données locales de cet appareil (migration). Les catégories par défaut en
   double sont fusionnées automatiquement.
3. Les modifications faites sur un appareil arrivent sur l'autre au prochain
   cycle (immédiat si l'app est ouverte et en ligne, sinon à la réouverture).

---

## Dépannage

| Problème | Cause probable | Solution |
|---|---|---|
| « Supabase n'est pas encore configuré » | `js/config.js` toujours en placeholder, ou vieille version en cache | Remplir le fichier + incrémenter `NOM_CACHE` |
| « Email ou mot de passe incorrect » | Mauvaise saisie, ou email non confirmé | Vérifier l'email de confirmation, ou « Mot de passe oublié ? » |
| « Connexion internet requise » | Pas de réseau au moment de se connecter | L'app fonctionne quand même hors-ligne ; se connecter nécessite internet |
| « ⚠️ Sync impossible » | Erreur réseau ou session expirée | Réessai automatique ; ou « Synchroniser maintenant » dans Paramètres |
| Erreur SQL à l'étape 3 | Script exécuté deux fois | Le script est préfixé `if not exists`, il est donc sans danger de le relancer |
