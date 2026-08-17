// db.js — gestion IndexedDB (ouverture, stores, requêtes de base)
//
// Depuis la V3 (Supabase), chaque enregistrement porte en plus :
//   - userId     : id Supabase du propriétaire (null = mode invité, jamais synchronisé)
//   - syncStatus : 'en_attente' (à pousser) ou 'synchronise' (à jour côté serveur)
//   - supprime   : soft delete — vrai si le mot/catégorie a été supprimé localement
//                  mais que la suppression doit encore se propager aux autres appareils.

const NOM_BASE = 'vocabDB';
const VERSION_BASE = 2;

// Référence mise en cache de la base ouverte (évite de rouvrir à chaque requête)
let baseIndexedDB = null;

/**
 * Ouvre (ou récupère) la base IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function obtenirBase() {
  return new Promise((resolve, reject) => {
    if (baseIndexedDB) {
      resolve(baseIndexedDB);
      return;
    }

    const requete = indexedDB.open(NOM_BASE, VERSION_BASE);

    requete.onupgradeneeded = (evenement) => {
      const base = evenement.target.result;

      // Store « mots » : clé primaire id, index par catégorie et date de modification
      if (!base.objectStoreNames.contains('mots')) {
        const storeMots = base.createObjectStore('mots', { keyPath: 'id' });
        storeMots.createIndex('categorieIds', 'categorieIds', { multiEntry: true });
        storeMots.createIndex('dateModification', 'dateModification');
      }

      // Store « categories » : clé primaire id, index par parentId
      if (!base.objectStoreNames.contains('categories')) {
        const storeCategories = base.createObjectStore('categories', { keyPath: 'id' });
        storeCategories.createIndex('parentId', 'parentId');
      }

      // Migration v1 -> v2 : ajoute les champs de synchronisation aux enregistrements existants.
      // Les données existantes sont conservées telles quelles, seuls les nouveaux champs
      // sont ajoutés avec leurs valeurs par défaut.
      const migrerStore = (nomStore) => {
        const store = evenement.target.transaction.objectStore(nomStore);
        return new Promise((resoudre, rejeter) => {
          const curseur = store.openCursor();
          curseur.onerror = () => rejeter(curseur.error);
          curseur.onsuccess = () => {
            const curseurCourant = curseur.result;
            if (!curseurCourant) {
              resoudre();
              return;
            }
            const enregistrement = curseurCourant.value;
            if (enregistrement.userId === undefined) {
              enregistrement.userId = null;
              enregistrement.syncStatus = 'en_attente';
              enregistrement.supprime = false;
              curseurCourant.update(enregistrement);
            }
            curseurCourant.continue();
          };
        });
      };

      evenement.target.transaction.oncomplete = () => {};
      migrerStore('mots');
      migrerStore('categories');
    };

    requete.onsuccess = (evenement) => {
      baseIndexedDB = evenement.target.result;
      resolve(baseIndexedDB);
    };

    requete.onerror = (evenement) => {
      console.error('Erreur lors de l\'ouverture de la base IndexedDB', evenement.target.error);
      reject(evenement.target.error);
    };
  });
}

/**
 * Exécute une requête sur un store dans une transaction, avec gestion d'erreur.
 * @param {string} nomStore - Nom du store ('mots' ou 'categories')
 * @param {string} mode - 'readonly' ou 'readwrite'
 * @param {function(IDBObjectStore): IDBRequest} action - Fonction recevant le store et retournant la requête
 * @returns {Promise<any>} Résultat de la requête (ex: liste de getAll, objet ajouté, etc.)
 */
function executerRequete(nomStore, mode, action) {
  return obtenirBase().then((base) => new Promise((resolve, reject) => {
    const transaction = base.transaction(nomStore, mode);
    const store = transaction.objectStore(nomStore);
    let requete;

    try {
      requete = action(store);
    } catch (erreur) {
      transaction.abort();
      console.error(`Erreur pendant la transaction « ${nomStore} »`, erreur);
      reject(erreur);
      return;
    }

    transaction.oncomplete = () => resolve(requete ? requete.result : undefined);
    transaction.onerror = (evenement) => {
      console.error(`Erreur IndexedDB sur le store « ${nomStore} »`, evenement.target.error);
      reject(evenement.target.error);
    };
    transaction.onabort = (evenement) => {
      console.error(`Transaction annulée sur le store « ${nomStore} »`, evenement.target.error);
      reject(evenement.target.error);
    };
  }));
}

/**
 * Génère un identifiant unique basé sur timestamp + aléatoire (sans librairie externe).
 * @returns {string} Identifiant au format UUID
 */
function genererUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (caractere) => {
    const aleatoire = (Date.now() + Math.random() * 16) % 16 | 0;
    const valeur = caractere === 'x' ? aleatoire : (aleatoire & 0x3) | 0x8;
    return valeur.toString(16);
  });
}

// ---- Synchronisation : aide partagée ----

/**
 * Complète un enregistrement avec les champs de synchronisation manquants
 * (ne remplace jamais une valeur déjà présente).
 * @param {Object} enregistrement
 * @returns {Object}
 */
function normaliserEnregistrement(enregistrement) {
  const maintenant = new Date().toISOString();
  let userId = enregistrement.userId;
  if (userId === undefined) {
    userId = (typeof obtenirUtilisateurCourantId === 'function') ? obtenirUtilisateurCourantId() : null;
  }
  return {
    ...enregistrement,
    userId,
    syncStatus: enregistrement.syncStatus || 'en_attente',
    supprime: enregistrement.supprime === true,
    dateModification: enregistrement.dateModification || maintenant,
    // Révision espacée (SM-2) : état d'apprentissage par mot
    // (conservé tel quel s'il est déjà présent, valeurs par défaut sinon)
    repetition: enregistrement.repetition ?? 0,
    easeFacteur: enregistrement.easeFacteur ?? 2.5,
    intervalleJours: enregistrement.intervalleJours ?? null
  };
}

/**
 * Met à jour (put) plusieurs enregistrements dans une seule transaction.
 * @param {string} nomStore
 * @param {Array<Object>} enregistrements
 * @returns {Promise<void>}
 */
function mettreAJourPlusieurs(nomStore, enregistrements) {
  if (enregistrements.length === 0) {
    return Promise.resolve();
  }
  return executerRequete(nomStore, 'readwrite', (store) => {
    enregistrements.forEach((enregistrement) => store.put(enregistrement));
    return undefined;
  });
}

/**
 * Marque des enregistrements comme synchronisés après un push réussi.
 * @param {string} nomStore
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
function marquerSynchronises(nomStore, ids) {
  if (ids.length === 0) {
    return Promise.resolve();
  }
  return executerRequete(nomStore, 'readonly', (store) => store.getAll()).then((tous) => {
    const aMarquer = tous
      .filter((r) => ids.includes(r.id) && r.syncStatus !== 'synchronise')
      .map((r) => ({ ...r, syncStatus: 'synchronise' }));
    return mettreAJourPlusieurs(nomStore, aMarquer);
  });
}

/**
 * Liste des enregistrements en attente de synchronisation pour un utilisateur.
 * @param {string} nomStore
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
function obtenirEnregistrementsEnAttente(nomStore, userId) {
  return executerRequete(nomStore, 'readonly', (store) => store.getAll()).then((tous) =>
    tous.filter((r) => r.userId === userId && r.syncStatus === 'en_attente')
  );
}

// ---- Mots ----

/**
 * Ajoute un nouveau mot dans le store « mots ».
 * Les champs de synchronisation manquants sont complétés automatiquement.
 * @param {Object} mot - Le mot à ajouter (avec id unique)
 * @returns {Promise<Object>} Le mot ajouté
 */
function ajouterMot(mot) {
  const motNormalise = normaliserEnregistrement(mot);
  return executerRequete('mots', 'readwrite', (store) => store.add(motNormalise))
    .then(() => {
      if (typeof planifierSync === 'function') {
        planifierSync();
      }
      return motNormalise;
    });
}

/**
 * Modifie un mot existant (ou le crée s'il n'existe pas encore).
 * @param {Object} mot - Le mot avec ses nouvelles valeurs
 * @param {{provenance?: 'utilisateur'|'sync'}} [options] - 'sync' pour les écritures
 *   provenant de la synchronisation (ne repasse pas l'enregistrement en attente
 *   et ne redéclenche pas une synchronisation — évite la boucle push/pull)
 * @returns {Promise<Object>} Le mot modifié
 */
function modifierMot(mot, options = {}) {
  const provenance = options.provenance || 'utilisateur';
  const motMaj = normaliserEnregistrement(mot);
  if (provenance !== 'sync') {
    motMaj.syncStatus = 'en_attente';
  }
  return executerRequete('mots', 'readwrite', (store) => store.put(motMaj))
    .then(() => {
      if (provenance !== 'sync' && typeof planifierSync === 'function') {
        planifierSync();
      }
      return motMaj;
    });
}

/**
 * Supprime un mot par son id.
 * - Mot jamais associé à un compte (userId null) : suppression physique immédiate.
 * - Mot associé à un compte : soft delete (supprime: true) pour que la
 *   suppression se propage aux autres appareils lors de la prochaine sync.
 * @param {string} id - Identifiant du mot à supprimer
 * @returns {Promise<void>}
 */
function supprimerMot(id) {
  return executerRequete('mots', 'readonly', (store) => store.get(id)).then((mot) => {
    if (!mot) {
      return;
    }
    if (mot.userId) {
      return modifierMot({ ...mot, supprime: true, dateModification: new Date().toISOString() });
    }
    return executerRequete('mots', 'readwrite', (store) => store.delete(id));
  });
}

/**
 * Récupère tous les mots du store (hors enregistrements supprimés, sauf demande contraire).
 * @param {{inclureSupprimes?: boolean}} [options]
 * @returns {Promise<Array<Object>>} La liste des mots
 */
function obtenirTousLesMots(options = {}) {
  return executerRequete('mots', 'readonly', (store) => store.getAll()).then((mots) =>
    options.inclureSupprimes ? mots : mots.filter((m) => !m.supprime)
  );
}

/**
 * Mots en attente de synchronisation pour un utilisateur.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
function obtenirMotsEnAttente(userId) {
  return obtenirEnregistrementsEnAttente('mots', userId);
}

/**
 * Marque des mots comme synchronisés après un push réussi.
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
function marquerMotsSynchronises(ids) {
  return marquerSynchronises('mots', ids);
}

// ---- Catégories ----

/**
 * Ajoute une nouvelle catégorie dans le store « categories ».
 * Les champs de synchronisation manquants sont complétés automatiquement.
 * @param {Object} categorie - La catégorie à ajouter (avec id unique)
 * @returns {Promise<Object>} La catégorie ajoutée
 */
function ajouterCategorie(categorie) {
  const categorieNormalisee = normaliserEnregistrement(categorie);
  return executerRequete('categories', 'readwrite', (store) => store.add(categorieNormalisee))
    .then(() => {
      if (typeof planifierSync === 'function') {
        planifierSync();
      }
      return categorieNormalisee;
    });
}

/**
 * Modifie une catégorie existante (ou la crée si elle n'existe pas encore).
 * @param {Object} categorie - La catégorie avec ses nouvelles valeurs
 * @param {{provenance?: 'utilisateur'|'sync'}} [options] - voir modifierMot
 * @returns {Promise<Object>} La catégorie modifiée
 */
function modifierCategorie(categorie, options = {}) {
  const provenance = options.provenance || 'utilisateur';
  const categorieMaj = normaliserEnregistrement(categorie);
  if (provenance !== 'sync') {
    categorieMaj.syncStatus = 'en_attente';
  }
  return executerRequete('categories', 'readwrite', (store) => store.put(categorieMaj))
    .then(() => {
      if (provenance !== 'sync' && typeof planifierSync === 'function') {
        planifierSync();
      }
      return categorieMaj;
    });
}

/**
 * Supprime une catégorie par son id (soft delete si elle appartient à un compte).
 * @param {string} id - Identifiant de la catégorie à supprimer
 * @returns {Promise<void>}
 */
function supprimerCategorie(id) {
  return executerRequete('categories', 'readonly', (store) => store.get(id)).then((categorie) => {
    if (!categorie) {
      return;
    }
    if (categorie.userId) {
      return modifierCategorie({ ...categorie, supprime: true, dateModification: new Date().toISOString() });
    }
    return executerRequete('categories', 'readwrite', (store) => store.delete(id));
  });
}

/**
 * Récupère toutes les catégories du store (hors enregistrements supprimés, sauf demande contraire).
 * @param {{inclureSupprimes?: boolean}} [options]
 * @returns {Promise<Array<Object>>} La liste des catégories
 */
function obtenirToutesLesCategories(options = {}) {
  return executerRequete('categories', 'readonly', (store) => store.getAll()).then((categories) =>
    options.inclureSupprimes ? categories : categories.filter((c) => !c.supprime)
  );
}

/**
 * Catégories en attente de synchronisation pour un utilisateur.
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
function obtenirCategoriesEnAttente(userId) {
  return obtenirEnregistrementsEnAttente('categories', userId);
}

/**
 * Marque des catégories comme synchronisées après un push réussi.
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
function marquerCategoriesSynchronisees(ids) {
  return marquerSynchronises('categories', ids);
}

// ---- Migration au premier login ----

/**
 * Associe toutes les données locales (mode invité, userId null) à un utilisateur
 * lors de sa première connexion, puis les marque en attente de synchronisation.
 *
 * Cas particulier des catégories par défaut : si le compte possède déjà une
 * catégorie par défaut du même nom (créée sur un autre appareil), la catégorie
 * locale est fusionnée (les mots qui y pointaient sont réassignés) au lieu de
 * créer un doublon. Les catégories créées manuellement sont toujours conservées.
 *
 * @param {string} userId - Id Supabase de l'utilisateur connecté
 * @returns {Promise<{motsAssocies: number, categoriesAssociees: number, categoriesFusionnees: number}>}
 */
function associerDonneesAUtilisateur(userId) {
  return Promise.all([
    obtenirToutesLesCategories({ inclureSupprimes: true }),
    obtenirTousLesMots({ inclureSupprimes: true })
  ]).then(([categories, mots]) => {
    // Catégories par défaut déjà présentes pour ce compte (issues du pull initial)
    const defautsExistants = new Map();
    categories
      .filter((c) => c.userId === userId && c.estParDefaut && !c.supprime)
      .forEach((c) => {
        if (!defautsExistants.has(c.nom)) {
          defautsExistants.set(c.nom, c.id);
        }
      });

    const operations = [];
    const remplacements = new Map(); // id catégorie locale -> id catégorie du compte
    let categoriesFusionnees = 0;

    categories.filter((c) => c.userId === null).forEach((categorie) => {
      if (categorie.estParDefaut && defautsExistants.has(categorie.nom)) {
        remplacements.set(categorie.id, defautsExistants.get(categorie.nom));
        categoriesFusionnees++;
        operations.push(executerRequete('categories', 'readwrite', (store) => store.delete(categorie.id)));
      } else {
        operations.push(modifierCategorie(
          { ...categorie, userId, syncStatus: 'en_attente' },
          { provenance: 'sync' }
        ));
      }
    });

    let motsAssocies = 0;
    mots.filter((m) => m.userId === null).forEach((mot) => {
      motsAssocies++;
      operations.push(modifierMot(
        {
          ...mot,
          userId,
          syncStatus: 'en_attente',
          categorieIds: (mot.categorieIds || []).map((id) => remplacements.get(id) || id)
        },
        { provenance: 'sync' }
      ));
    });

    return Promise.all(operations).then(() => ({
      motsAssocies,
      categoriesAssociees: categories.filter((c) => c.userId === null).length,
      categoriesFusionnees
    }));
  });
}

// ---- Aide à l'affichage partagée entre les écrans (Liste, Révision) ----

/**
 * Traduit un niveau de maîtrise en libellé explicite.
 * @param {string} niveau - 'nouveau', 'en_cours' ou 'acquis'
 * @returns {string}
 */
function libelleNiveau(niveau) {
  const libelles = {
    nouveau: 'À apprendre',
    en_cours: 'En apprentissage',
    acquis: 'Maîtrisé'
  };
  return libelles[niveau] || niveau;
}

/**
 * Interprète une valeur de prochaine révision en objet Date locale.
 * Accepte « AAAA-MM-JJ » (choix utilisateur, minuit local) ou une date ISO.
 * @param {string} valeur
 * @returns {Date|null}
 */
function parserDateRevision(valeur) {
  if (!valeur) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return new Date(`${valeur}T00:00:00`);
  }
  return new Date(valeur);
}

/**
 * Formate une Date en « AAAA-MM-JJ » locale (valeur d'un input[type=date]).
 * @param {Date} date
 * @returns {string}
 */
function dateEnLocalAAJJMMJJ(date) {
  const d = new Date(date);
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

/**
 * Valeur à afficher dans un champ date à partir d'une prochaine révision
 * (« AAAA-MM-JJ » conservée telle quelle, ISO convertie en date locale).
 * @param {string|undefined} prochaineRevision
 * @returns {string}
 */
function valeurPourChampDate(prochaineRevision) {
  if (!prochaineRevision) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(prochaineRevision)) {
    return prochaineRevision;
  }
  return dateEnLocalAAJJMMJJ(new Date(prochaineRevision));
}

/**
 * Retourne la valeur à pré-sélectionner dans le sélecteur de délai (1..7)
 * si la prochaineRevision est dans les 1..7 jours à venir.
 * Sinon retourne '' (Automatique).
 * @param {string|undefined} prochaineRevision
 * @returns {string}
 */
function valeurPourSelectDelai(prochaineRevision) {
  if (!prochaineRevision) return '';
  const date = parserDateRevision(prochaineRevision);
  if (!date) return '';
  // Calcul en jours entiers entre aujourd'hui (minuit local) et la date cible
  const maintenant = new Date();
  // Normaliser à la date locale (00:00:00) pour comparer en jours
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const diffMs = date.getTime() - debutJour.getTime();
  const diffJours = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffJours >= 1 && diffJours <= 7) {
    return String(diffJours);
  }
  return '';
}

/**
 * Crée les 3 catégories par défaut si le store « categories » est vide.
 * @returns {Promise<Array<Object>>} Les catégories présentes après initialisation
 */
function initialiserCategoriesParDefaut() {
  return obtenirToutesLesCategories().then((categories) => {
    if (categories.length > 0) {
      return categories;
    }

    const maintenant = new Date().toISOString();
    const defauts = [
      { id: genererUUID(), nom: 'Étude Télécom', parentId: null, estParDefaut: true, dateCreation: maintenant, dateModification: maintenant },
      { id: genererUUID(), nom: 'Apprentissage', parentId: null, estParDefaut: true, dateCreation: maintenant, dateModification: maintenant },
      { id: genererUUID(), nom: 'Langue', parentId: null, estParDefaut: true, dateCreation: maintenant, dateModification: maintenant }
    ];

    return Promise.all(defauts.map(ajouterCategorie)).then(() => defauts);
  });
}
