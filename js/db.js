// db.js — gestion IndexedDB (ouverture, stores, requêtes de base)

const NOM_BASE = 'vocabDB';
const VERSION_BASE = 1;

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

// ---- Mots ----

/**
 * Ajoute un nouveau mot dans le store « mots ».
 * @param {Object} mot - Le mot à ajouter (avec id unique)
 * @returns {Promise<Object>} Le mot ajouté
 */
function ajouterMot(mot) {
  return executerRequete('mots', 'readwrite', (store) => store.add(mot));
}

/**
 * Modifie un mot existant (ou le crée s'il n'existe pas encore).
 * @param {Object} mot - Le mot avec ses nouvelles valeurs
 * @returns {Promise<Object>} Le mot modifié
 */
function modifierMot(mot) {
  return executerRequete('mots', 'readwrite', (store) => store.put(mot));
}

/**
 * Supprime un mot par son id.
 * @param {string} id - Identifiant du mot à supprimer
 * @returns {Promise<void>}
 */
function supprimerMot(id) {
  return executerRequete('mots', 'readwrite', (store) => store.delete(id));
}

/**
 * Récupère tous les mots du store.
 * @returns {Promise<Array<Object>>} La liste des mots
 */
function obtenirTousLesMots() {
  return executerRequete('mots', 'readonly', (store) => store.getAll());
}

// ---- Catégories ----

/**
 * Ajoute une nouvelle catégorie dans le store « categories ».
 * @param {Object} categorie - La catégorie à ajouter (avec id unique)
 * @returns {Promise<Object>} La catégorie ajoutée
 */
function ajouterCategorie(categorie) {
  return executerRequete('categories', 'readwrite', (store) => store.add(categorie));
}

/**
 * Modifie une catégorie existante (ou la crée si elle n'existe pas encore).
 * @param {Object} categorie - La catégorie avec ses nouvelles valeurs
 * @returns {Promise<Object>} La catégorie modifiée
 */
function modifierCategorie(categorie) {
  return executerRequete('categories', 'readwrite', (store) => store.put(categorie));
}

/**
 * Supprime une catégorie par son id.
 * @param {string} id - Identifiant de la catégorie à supprimer
 * @returns {Promise<void>}
 */
function supprimerCategorie(id) {
  return executerRequete('categories', 'readwrite', (store) => store.delete(id));
}

/**
 * Récupère toutes les catégories du store.
 * @returns {Promise<Array<Object>>} La liste des catégories
 */
function obtenirToutesLesCategories() {
  return executerRequete('categories', 'readonly', (store) => store.getAll());
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
