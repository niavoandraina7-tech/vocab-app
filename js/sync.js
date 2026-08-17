// sync.js — moteur de synchronisation Supabase (push / pull / fusion)
//
// Principe : IndexedDB reste la source de vérité locale. La synchronisation
// pousse les changements marqués « en_attente » vers Supabase, tire les
// changements distants, et fusionne avec la règle éprouvée de l'export/import :
// à id égal, la version la plus récente (dateModification) gagne.
//
// Déclencheurs : à la connexion, au retour en ligne, à chaque modification
// locale (différée), périodiquement (60 s) et à la réouverture de l'app.

// État de la dernière synchronisation
let etatSync = 'inactif'; // 'inactif' | 'en_cours' | 'synchronise' | 'hors_ligne' | 'erreur'
let derniereSync = null;
let synchroEnCours = false;

let minuteurPeriodique = null;
let minuteurDiffere = null;

// Canal temps réel (Supabase Realtime) : notifications immédiates de changement
// distant. Le polling périodique reste en secours (Realtime indisponible,
// hors ligne, etc.).
let canalRealtime = null;
let realtimeActif = false;
let minuteurRealtime = null; // anti-rafale : regroupe les événements rapprochés

const INTERVALLE_SYNC_MS = 60 * 1000; // tentative périodique : 1 minute
const DELAI_SYNC_APRES_MODIFICATION_MS = 3000; // différé après une modification locale
const DELAI_REALTIME_MS = 800; // anti-rafale après un événement temps réel

/**
 * Retourne l'état courant de la synchronisation (pour l'affichage).
 * @returns {{etat: string, derniereSync: Date|null}}
 */
function obtenirEtatSync() {
  return { etat: etatSync, derniereSync };
}

/**
 * Planifie une synchronisation différée (regroupe plusieurs modifications).
 * Appelé automatiquement par db.js après chaque écriture utilisateur.
 */
function planifierSync() {
  if (minuteurDiffere) {
    clearTimeout(minuteurDiffere);
  }
  minuteurDiffere = setTimeout(() => {
    minuteurDiffere = null;
    synchroniser();
  }, DELAI_SYNC_APRES_MODIFICATION_MS);
}

/**
 * Lance la boucle périodique de synchronisation pour l'utilisateur connecté,
 * puis déclenche une première synchronisation immédiate.
 */
function demarrerSyncPourUtilisateur() {
  arreterSync();
  const user = obtenirUtilisateurCourant();
  if (user) {
    demarrerRealtime(user.id);
  }
  minuteurPeriodique = setInterval(() => {
    if (navigator.onLine !== false) {
      // Secours : si le canal temps réel n'est pas actif (erreur, timeout,
      // reconnexion réseau), le relancer — le polling couvre l'intervalle.
      if (!realtimeActif && obtenirUtilisateurCourant() && obtenirClientSupabase()) {
        demarrerRealtime(obtenirUtilisateurCourant().id);
      }
      synchroniser();
    }
  }, INTERVALLE_SYNC_MS);
  if (navigator.onLine !== false) {
    synchroniser();
  }
}

// ---- Temps réel (Supabase Realtime) ----

/**
 * Écoute les modifications des tables « mots » et « categories » de l'utilisateur
 * via Supabase Realtime (websocket). Chaque événement déclenche une synchronisation
 * différée et anti-rafale. La boucle périodique reste en secours.
 * @param {string} userId
 */
function demarrerRealtime(userId) {
  arreterRealtime();
  const client = obtenirClientSupabase();
  if (!client || typeof client.channel !== 'function') {
    return;
  }

  const declencherSynchronisation = () => {
    if (minuteurRealtime) {
      clearTimeout(minuteurRealtime);
    }
    minuteurRealtime = setTimeout(() => {
      minuteurRealtime = null;
      if (obtenirUtilisateurCourant() && navigator.onLine !== false) {
        synchroniser();
      }
    }, DELAI_REALTIME_MS);
  };

  canalRealtime = client.channel(`sync-${userId}`);
  canalRealtime
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'mots',
      filter: `user_id=eq.${userId}`
    }, declencherSynchronisation)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'categories',
      filter: `user_id=eq.${userId}`
    }, declencherSynchronisation)
    .subscribe((statut) => {
      if (statut === 'SUBSCRIBED') {
        realtimeActif = true;
      } else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT' || statut === 'CLOSED') {
        realtimeActif = false;
        console.warn(`Realtime Supabase indisponible (${statut}) — le polling périodique prend le relais.`);
      }
    });
}

/**
 * Ferme le canal temps réel (déconnexion, changement d'utilisateur).
 */
function arreterRealtime() {
  if (minuteurRealtime) {
    clearTimeout(minuteurRealtime);
    minuteurRealtime = null;
  }
  if (canalRealtime) {
    const client = obtenirClientSupabase();
    if (client && typeof client.removeChannel === 'function') {
      try {
        client.removeChannel(canalRealtime);
      } catch (erreur) {
        console.warn('Erreur en fermant le canal temps réel', erreur);
      }
    }
    canalRealtime = null;
  }
  realtimeActif = false;
}

/**
 * Arrête la synchronisation (déconnexion).
 */
function arreterSync() {
  if (minuteurPeriodique) {
    clearInterval(minuteurPeriodique);
    minuteurPeriodique = null;
  }
  if (minuteurDiffere) {
    clearTimeout(minuteurDiffere);
    minuteurDiffere = null;
  }
  arreterRealtime();
  synchroEnCours = false;
  etatSync = 'inactif';
  mettreAJourIndicateurSync();
}

/**
 * Branche les déclencheurs liés au réseau et à la visibilité de l'app.
 * À appeler une fois au démarrage de l'application.
 */
function initialiserSync() {
  window.addEventListener('online', () => {
    if (obtenirUtilisateurCourant() && navigator.onLine !== false) {
      // Relance le canal temps réel (le websocket a pu se couper hors ligne)
      demarrerRealtime(obtenirUtilisateurCourant().id);
      synchroniser();
    }
  });
  window.addEventListener('offline', () => {
    etatSync = 'hors_ligne';
    mettreAJourIndicateurSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && obtenirUtilisateurCourant() && navigator.onLine !== false) {
      synchroniser();
    }
  });
}

// ---- Synchronisation complète (push puis pull) ----

/**
 * Pousse les changements locaux puis tire les changements distants.
 * Ne fait rien si personne n'est connecté, si l'app est hors ligne ou si
 * une synchronisation est déjà en cours.
 */
async function synchroniser() {
  const client = obtenirClientSupabase();
  const user = obtenirUtilisateurCourant();
  if (!client || !user || synchroEnCours) {
    return;
  }
  if (navigator.onLine === false) {
    etatSync = 'hors_ligne';
    mettreAJourIndicateurSync();
    return;
  }

  synchroEnCours = true;
  etatSync = 'en_cours';
  mettreAJourIndicateurSync();

  try {
    await pousserChangements(client, user.id);
    const nbAppliques = await tirerChangements(client, user.id);
    derniereSync = new Date();
    etatSync = 'synchronise';
    // Une donnée distante a changé (autre appareil, temps réel) :
    // rafraîchit l'écran en cours pour que l'utilisateur voie le résultat.
    if (nbAppliques > 0) {
      rafraichirEcranApresSync();
    }
  } catch (erreur) {
    // Jamais bloquant : les données locales restent intactes, on retentera plus tard
    console.error('Erreur de synchronisation (nouvelle tentative automatique)', erreur);
    etatSync = 'erreur';
  } finally {
    synchroEnCours = false;
    mettreAJourIndicateurSync();
  }
}

// ---- Push (local -> Supabase) ----

/**
 * Envoie vers Supabase les enregistrements locaux en attente
 * (catégories d'abord, puis mots — comme l'import JSON).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
async function pousserChangements(client, userId) {
  // 1. Catégories
  const categories = await obtenirCategoriesEnAttente(userId);
  if (categories.length > 0) {
    const { error: erreurCategories } = await client
      .from('categories')
      .upsert(categories.map((c) => categorieVersLigne(c, userId)), { onConflict: 'id' });
    if (erreurCategories) {
      throw erreurCategories;
    }
    await marquerCategoriesSynchronisees(categories.map((c) => c.id));
  }

  // 2. Mots
  const mots = await obtenirMotsEnAttente(userId);
  if (mots.length > 0) {
    const { error: erreurMots } = await client
      .from('mots')
      .upsert(mots.map((m) => motVersLigne(m, userId)), { onConflict: 'id' });
    if (erreurMots) {
      throw erreurMots;
    }
    await marquerMotsSynchronises(mots.map((m) => m.id));
  }
}

// ---- Pull (Supabase -> local) ----

/**
 * Récupère les enregistrements distants modifiés depuis la dernière
 * synchronisation connue, puis les fusionne localement (LWW).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @returns {Promise<number>} Nombre d'enregistrements effectivement appliqués
 */
async function tirerChangements(client, userId) {
  const cle = `sync_dernier_pull_${userId}`;
  const depuis = localStorage.getItem(cle) || '1970-01-01T00:00:00.000Z';

  const [motsDistant, categoriesDistant] = await Promise.all([
    lireTableDepuis(client, 'mots', userId, depuis),
    lireTableDepuis(client, 'categories', userId, depuis)
  ]);

  let dateMax = depuis;
  let aRepousser = false;
  let nbAppliques = 0;

  for (const ligne of categoriesDistant) {
    const resultat = await appliquerDistant('categories', modifierCategorie, ligneVersCategorie(ligne));
    if (resultat === 'applique') {
      nbAppliques++;
    } else if (resultat === 'repousser') {
      aRepousser = true;
    }
    if (ligne.date_modification > dateMax) {
      dateMax = ligne.date_modification;
    }
  }

  for (const ligne of motsDistant) {
    const resultat = await appliquerDistant('mots', modifierMot, ligneVersMot(ligne));
    if (resultat === 'applique') {
      nbAppliques++;
    } else if (resultat === 'repousser') {
      aRepousser = true;
    }
    if (ligne.date_modification > dateMax) {
      dateMax = ligne.date_modification;
    }
  }

  localStorage.setItem(cle, dateMax);

  // Une version locale plus récente que le serveur a été détectée : on la
  // repousse à la prochaine occasion (elle a été remise en attente ci-dessus).
  if (aRepousser) {
    planifierSync();
  }

  return nbAppliques;
}

/**
 * Rafraîchit l'écran visible après qu'un pull a appliqué des changements
 * distants (Liste, Catégories, statut de sync) — sans toucher aux autres écrans
 * (détail, quiz en cours, formulaire d'ajout).
 */
function rafraichirEcranApresSync() {
  const ecranActif = document.querySelector('.ecran.active');
  if (!ecranActif) {
    return;
  }
  const id = ecranActif.id;
  if (id === 'ecran-liste' && typeof afficherListeMots === 'function') {
    afficherListeMots();
    if (typeof mettreAJourBandeauRappel === 'function') {
      mettreAJourBandeauRappel();
    }
  } else if (id === 'ecran-categories' && typeof afficherCategories === 'function') {
    afficherCategories();
  }
  if (typeof mettreAJourIndicateurSync === 'function') {
    mettreAJourIndicateurSync();
  }
}

/**
 * Lit toutes les lignes d'une table modifiées depuis une date, avec pagination.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {'mots'|'categories'} table
 * @param {string} userId
 * @param {string} depuis - Date ISO de référence
 * @returns {Promise<Array<Object>>}
 */
async function lireTableDepuis(client, table, userId, depuis) {
  const lignes = [];
  let debut = 0;

  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .gt('date_modification', depuis)
      .order('date_modification', { ascending: true })
      .range(debut, debut + 999);

    if (error) {
      throw error;
    }
    lignes.push(...(data || []));
    if (!data || data.length < 1000) {
      break;
    }
    debut += 1000;
  }

  return lignes;
}

/**
 * Applique un enregistrement distant en local avec la règle
 * « la date la plus récente gagne » (fusion LWW).
 * @param {'mots'|'categories'} nomStore
 * @param {function(Object, Object): Promise<Object>} ecrire - modifierMot ou modifierCategorie
 * @param {Object} distant - Enregistrement distant (champs camelCase)
 * @returns {Promise<'applique'|'repousser'|'identique'>}
 */
function appliquerDistant(nomStore, ecrire, distant) {
  return executerRequete(nomStore, 'readonly', (store) => store.get(distant.id)).then((local) => {
    if (!local) {
      // Nouveau : créé localement, déjà synchronisé
      return ecrire({ ...distant, syncStatus: 'synchronise' }, { provenance: 'sync' }).then(() => 'applique');
    }

    const diff = new Date(distant.dateModification).getTime() - new Date(local.dateModification).getTime();

    if (diff > 0) {
      // Le distant est plus récent : on l'applique sans repasser en attente
      return ecrire({ ...distant, syncStatus: 'synchronise' }, { provenance: 'sync' }).then(() => 'applique');
    }

    if (diff < 0 && local.syncStatus === 'synchronise') {
      // Le local est plus récent : remis en attente pour être repoussé au prochain push
      return ecrire({ ...local, syncStatus: 'en_attente' }, { provenance: 'sync' }).then(() => 'repousser');
    }

    return 'identique';
  });
}

// ---- Migration au premier login ----

/**
 * Premier login : tire les données du compte, associe les données locales
 * (avec fusion des catégories par défaut en double), pousse tout, puis
 * relance un pull final. Aucune donnée locale n'est supprimée.
 */
async function migrerEtSynchroniser() {
  const client = obtenirClientSupabase();
  const user = obtenirUtilisateurCourant();
  if (!client || !user) {
    return;
  }

  try {
    // 1. Pull initial : récupère les données du compte (ex : catégories par défaut d'un autre appareil)
    await tirerChangements(client, user.id);

    // 2. Associe les données locales au compte (fusion des catégories par défaut)
    await associerDonneesAUtilisateur(user.id);

    // 3. Push de toutes les données maintenant associées
    await pousserChangements(client, user.id);

    // 4. Pull final : récupère ce qui a pu arriver entre-temps
    await tirerChangements(client, user.id);

    derniereSync = new Date();
    etatSync = 'synchronise';
  } catch (erreur) {
    console.error('Erreur lors de la migration des données locales', erreur);
    etatSync = 'erreur';
  } finally {
    mettreAJourIndicateurSync();
  }
}

// ---- Correspondances entre le modèle local (camelCase) et Supabase (snake_case) ----

/**
 * Convertit une catégorie locale en ligne de table Supabase.
 * @param {Object} c
 * @param {string} userId
 * @returns {Object}
 */
function categorieVersLigne(c, userId) {
  return {
    id: c.id,
    user_id: userId,
    nom: c.nom,
    parent_id: c.parentId || null,
    est_par_defaut: !!c.estParDefaut,
    date_creation: c.dateCreation,
    date_modification: c.dateModification,
    supprime: !!c.supprime
  };
}

/**
 * Convertit une ligne Supabase « categories » en objet local.
 * @param {Object} l
 * @returns {Object}
 */
function ligneVersCategorie(l) {
  return {
    id: l.id,
    userId: l.user_id,
    nom: l.nom,
    parentId: l.parent_id,
    estParDefaut: l.est_par_defaut,
    dateCreation: l.date_creation,
    dateModification: l.date_modification,
    supprime: l.supprime
  };
}

/**
 * Convertit un mot local en ligne de table Supabase.
 * @param {Object} m
 * @param {string} userId
 * @returns {Object}
 */
function motVersLigne(m, userId) {
  return {
    id: m.id,
    user_id: userId,
    mot: m.mot,
    definition: m.definition || '',
    exemple: m.exemple || '',
    langue: m.langue || '',
    categorie_ids: m.categorieIds || [],
    niveau_maitrise: m.niveauMaitrise || 'nouveau',
    prochaine_revision: m.prochaineRevision || null,
    historique_revision: m.historiqueRevision || [],
    date_creation: m.dateCreation,
    date_modification: m.dateModification,
    supprime: !!m.supprime
  };
}

/**
 * Convertit une ligne Supabase « mots » en objet local.
 * @param {Object} l
 * @returns {Object}
 */
function ligneVersMot(l) {
  return {
    id: l.id,
    userId: l.user_id,
    mot: l.mot,
    definition: l.definition,
    exemple: l.exemple,
    langue: l.langue,
    categorieIds: l.categorie_ids || [],
    niveauMaitrise: l.niveau_maitrise,
    prochaineRevision: l.prochaine_revision,
    historiqueRevision: l.historique_revision || [],
    dateCreation: l.date_creation,
    dateModification: l.date_modification,
    supprime: l.supprime
  };
}

// ---- Indicateurs UI ----

/**
 * Met à jour l'indicateur discret de l'écran Liste (#indicateur-sync) et le
 * statut détaillé de la section Compte (#zone-statut-sync dans Paramètres).
 */
function mettreAJourIndicateurSync() {
  const indicateur = document.getElementById('indicateur-sync');
  const zoneStatut = document.getElementById('zone-statut-sync');
  const user = obtenirUtilisateurCourant();

  const rafraichir = (libelle, detail) => {
    if (indicateur) {
      if (!user) {
        indicateur.hidden = true;
        indicateur.textContent = '';
        indicateur.title = '';
      } else {
        indicateur.hidden = false;
        indicateur.textContent = libelle;
        indicateur.title = detail || libelle;
      }
    }
    if (zoneStatut) {
      zoneStatut.innerHTML = '';
      if (user) {
        const p = document.createElement('p');
        p.className = 'conseil';
        p.textContent = detail || libelle;
        zoneStatut.appendChild(p);
      }
    }
  };

  if (!user) {
    rafraichir('', '');
    return;
  }

  // Compte le nombre de modifications en attente pour l'affichage
  Promise.all([obtenirMotsEnAttente(user.id), obtenirCategoriesEnAttente(user.id)])
    .then(([mots, categories]) => {
      const enAttente = mots.length + categories.length;
      let libelle;
      let detail;

      if (etatSync === 'en_cours') {
        libelle = '⏳ Synchronisation en cours…';
        detail = libelle;
      } else if (etatSync === 'hors_ligne') {
        libelle = '📴 Hors ligne';
        detail = 'Hors ligne — les modifications seront synchronisées au retour de la connexion.';
      } else if (etatSync === 'erreur') {
        libelle = '⚠️ Sync impossible';
        detail = 'La synchronisation a échoué — nouvelle tentative automatique. Vos données restent en sécurité sur cet appareil.';
      } else if (enAttente > 0) {
        libelle = `📤 ${enAttente} modification(s) à synchroniser`;
        detail = libelle;
      } else {
        libelle = '☁️ À jour';
        detail = derniereSync
          ? `Dernière synchronisation : ${derniereSync.toLocaleString('fr-FR')}`
          : 'Aucune synchronisation effectuée pour le moment.';
      }

      rafraichir(libelle, detail);
    })
    .catch((erreur) => {
      console.error('Erreur lors du comptage des modifications en attente', erreur);
      rafraichir('☁️', '');
    });
}
