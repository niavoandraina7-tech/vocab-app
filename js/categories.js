// categories.js — gestion des catégories et sous-catégories

/**
 * Retourne l'ensemble des ids : catégorie choisie + toutes ses sous-catégories (profondeur illimitée).
 * @param {string} id - Id de la catégorie racine
 * @param {Array<Object>} categories - Liste plate des catégories
 * @returns {Set<string>}
 */
function obtenirIdsCategorieEtSousCategories(id, categories) {
  const ids = new Set([id]);
  const parId = new Map(categories.map((c) => [c.id, c]));

  categories.forEach((c) => {
    let ancetre = c.parentId ? parId.get(c.parentId) : null;
    while (ancetre) {
      if (ancetre.id === id) {
        ids.add(c.id);
        break;
      }
      ancetre = ancetre.parentId ? parId.get(ancetre.parentId) : null;
    }
  });

  return ids;
}

/**
 * Construit l'arbre des catégories à partir de la liste plate.
 * @param {Array<Object>} categories - Liste plate des catégories
 * @returns {Array<{categorie: Object, sousCategories: Array}>} Racines de l'arbre
 */
function construireArbreCategories(categories) {
  const parId = new Map(categories.map((c) => [c.id, { categorie: c, sousCategories: [] }]));
  const racines = [];

  categories.forEach((c) => {
    const noeud = parId.get(c.id);
    const parent = c.parentId ? parId.get(c.parentId) : null;
    if (parent) {
      parent.sousCategories.push(noeud);
    } else {
      racines.push(noeud);
    }
  });

  return racines;
}

/**
 * Retire une catégorie de la liste categorieIds de tous les mots concernés.
 * Les mots eux-mêmes sont conservés (recommandation V1).
 * @param {string} idCategorie - Id de la catégorie à retirer des mots
 * @returns {Promise<Array>}
 */
function retirerCategorieDesMots(idCategorie) {
  return obtenirTousLesMots().then((mots) => {
    const concernes = mots.filter((m) => (m.categorieIds || []).includes(idCategorie));
    return Promise.all(concernes.map((m) => modifierMot({
      ...m,
      categorieIds: m.categorieIds.filter((id) => id !== idCategorie),
      dateModification: new Date().toISOString()
    })));
  });
}

/**
 * Crée un petit formulaire inline (champ nom + boutons Ajouter/Annuler).
 * @param {string} placeholder - Texte indicatif du champ
 * @param {function(string)} onValider - Appelée avec le nom saisi à la validation
 * @returns {HTMLElement}
 */
function creerFormulaireNom(placeholder, onValider) {
  const conteneur = document.createElement('div');
  conteneur.className = 'form-nom-categorie';

  const champ = document.createElement('input');
  champ.type = 'text';
  champ.placeholder = placeholder;

  const btnValider = document.createElement('button');
  btnValider.type = 'button';
  btnValider.textContent = 'Ajouter';

  const btnAnnuler = document.createElement('button');
  btnAnnuler.type = 'button';
  btnAnnuler.className = 'btn-mini btn-annuler';
  btnAnnuler.textContent = 'Annuler';

  conteneur.append(champ, btnValider, btnAnnuler);

  const fermer = () => conteneur.remove();

  btnAnnuler.addEventListener('click', fermer);
  btnValider.addEventListener('click', () => {
    const nom = champ.value.trim();
    if (!nom) {
      champ.focus();
      return;
    }
    fermer();
    onValider(nom);
  });
  champ.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Enter') btnValider.click();
    if (evenement.key === 'Escape') fermer();
  });

  return conteneur;
}

/**
 * Rend un noeud de l'arbre : ligne (nom + actions) puis sous-catégories imbriquées.
 * @param {{categorie: Object, sousCategories: Array}} noeud
 * @param {number} profondeur - Niveau d'indentation
 * @returns {HTMLElement}
 */
function rendreNoeudCategorie(noeud, profondeur) {
  const categorie = noeud.categorie;

  const noeudEl = document.createElement('div');
  noeudEl.className = 'categorie-noeud';

  const ligne = document.createElement('div');
  ligne.className = 'categorie-ligne';
  ligne.style.paddingLeft = `${profondeur * 20}px`;

  const nom = document.createElement('span');
  nom.className = 'categorie-nom';
  nom.textContent = categorie.nom;

  const actions = document.createElement('div');
  actions.className = 'categorie-actions';

  // Bouton « ajouter une sous-catégorie »
  const btnSous = document.createElement('button');
  btnSous.type = 'button';
  btnSous.className = 'btn-mini';
  btnSous.textContent = '+ Sous-cat.';
  btnSous.title = 'Ajouter une sous-catégorie';
  btnSous.addEventListener('click', () => {
    const formulaire = creerFormulaireNom('Nom de la sous-catégorie', (nomSaisi) => {
      const maintenant = new Date().toISOString();
      ajouterCategorie({
        id: genererUUID(),
        nom: nomSaisi,
        parentId: categorie.id,
        estParDefaut: false,
        dateCreation: maintenant,
        dateModification: maintenant
      }).then(() => afficherCategories())
        .catch((erreur) => console.error('Erreur lors de la création de la sous-catégorie', erreur));
    });
    ligne.after(formulaire);
    formulaire.querySelector('input').focus();
  });

  // Bouton renommer (édition inline)
  const btnRenommer = document.createElement('button');
  btnRenommer.type = 'button';
  btnRenommer.className = 'btn-mini';
  btnRenommer.textContent = 'Renommer';
  btnRenommer.addEventListener('click', () => demarrerRenommage(categorie, nom, ligne));

  // Bouton supprimer
  const btnSupprimer = document.createElement('button');
  btnSupprimer.type = 'button';
  btnSupprimer.className = 'btn-mini btn-danger';
  btnSupprimer.textContent = 'Supprimer';
  btnSupprimer.addEventListener('click', () => supprimerCategorieAvecGestion(categorie));

  actions.append(btnSous, btnRenommer, btnSupprimer);
  ligne.append(nom, actions);
  noeudEl.appendChild(ligne);

  // Sous-catégories (triées par nom)
  if (noeud.sousCategories.length > 0) {
    noeud.sousCategories.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));
    noeud.sousCategories.forEach((sousNoeud) => {
      noeudEl.appendChild(rendreNoeudCategorie(sousNoeud, profondeur + 1));
    });
  }

  return noeudEl;
}

/**
 * Renommage inline : remplace le nom par un champ, sauvegarde sur Entrée/Blur, annule sur Échap.
 * @param {Object} categorie - La catégorie à renommer
 * @param {HTMLElement} elementNom - Le span contenant le nom actuel
 * @param {HTMLElement} elementLigne - La ligne contenant le nom
 */
function demarrerRenommage(categorie, elementNom, elementLigne) {
  let traite = false;

  const champ = document.createElement('input');
  champ.type = 'text';
  champ.className = 'champ-renommage';
  champ.value = categorie.nom;
  champ.setAttribute('aria-label', 'Nouveau nom de la catégorie');

  elementLigne.replaceChild(champ, elementNom);
  champ.focus();
  champ.select();

  const terminer = () => {
    if (traite) {
      return;
    }
    traite = true;
    const nouveauNom = champ.value.trim();
    if (nouveauNom && nouveauNom !== categorie.nom) {
      modifierCategorie({
        ...categorie,
        nom: nouveauNom,
        dateModification: new Date().toISOString()
      }).then(() => afficherCategories())
        .catch((erreur) => console.error('Erreur lors du renommage de la catégorie', erreur));
    } else {
      afficherCategories();
    }
  };

  champ.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Enter') terminer();
    if (evenement.key === 'Escape') {
      traite = true;
      afficherCategories();
    }
  });
  champ.addEventListener('blur', terminer);
}

/**
 * Suppression d'une catégorie avec gestion des cas :
 * - sous-catégories présentes → suppression bloquée avec message clair
 * - mots associés → la catégorie est retirée de leurs categorieIds (mots conservés)
 * @param {Object} categorie - La catégorie à supprimer
 */
function supprimerCategorieAvecGestion(categorie) {
  obtenirToutesLesCategories().then((categories) => {
    const aDesSousCategories = categories.some((c) => c.parentId === categorie.id);

    if (aDesSousCategories) {
      alert(`Impossible de supprimer « ${categorie.nom} » : supprimez d'abord ses sous-catégories.`);
      return;
    }

    if (!confirm(`Supprimer la catégorie « ${categorie.nom} » ? Les mots associés seront conservés.`)) {
      return;
    }

    retirerCategorieDesMots(categorie.id)
      .then(() => supprimerCategorie(categorie.id))
      .then(() => afficherCategories())
      .catch((erreur) => console.error('Erreur lors de la suppression de la catégorie', erreur));
  }).catch((erreur) => console.error('Erreur lors de la vérification des sous-catégories', erreur));
}

/**
 * Affiche l'écran Gestion des catégories sous forme d'arbre.
 */
function afficherCategories() {
  obtenirToutesLesCategories().then((categories) => {
    const conteneur = document.getElementById('liste-categories');
    conteneur.innerHTML = '';

    if (categories.length === 0) {
      conteneur.textContent = 'Aucune catégorie.';
      return;
    }

    const arbre = construireArbreCategories(categories);
    arbre.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));
    arbre.forEach((noeud) => conteneur.appendChild(rendreNoeudCategorie(noeud, 0)));
  }).catch((erreur) => console.error('Erreur lors du chargement des catégories', erreur));
}

// Bouton « Nouvelle catégorie principale » : affiche un formulaire inline
document.getElementById('btn-nouvelle-categorie').addEventListener('click', () => {
  const bouton = document.getElementById('btn-nouvelle-categorie');
  const formulaire = creerFormulaireNom('Nom de la catégorie principale', (nomSaisi) => {
    const maintenant = new Date().toISOString();
    ajouterCategorie({
      id: genererUUID(),
      nom: nomSaisi,
      parentId: null,
      estParDefaut: false,
      dateCreation: maintenant,
      dateModification: maintenant
    }).then(() => afficherCategories())
      .catch((erreur) => console.error('Erreur lors de la création de la catégorie principale', erreur));
  });
  bouton.after(formulaire);
  formulaire.querySelector('input').focus();
});
