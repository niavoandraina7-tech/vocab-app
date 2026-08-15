// revision.js — système de révision (liste à réviser, auto-évaluation)

// Seuils de révision en jours selon le niveau de maîtrise
const SEUILS_REVISION = { nouveau: 3, en_cours: 7, acquis: 14 };

// État de la session en cours
let sessionMots = [];
let sessionIndex = 0;
let sessionCompteur = { facile: 0, difficile: 0, echec: 0 };
let sessionEnCours = false;

/**
 * Un mot est « à réviser » s'il n'a jamais été révisé,
 * ou si sa dernière révision date de plus du seuil (en jours) de son niveau.
 * @param {Object} mot
 * @param {Date} maintenant - Date de référence (utile pour les tests)
 * @returns {boolean}
 */
function estAReviser(mot, maintenant = new Date()) {
  const historique = mot.historiqueRevision || [];
  if (historique.length === 0) {
    return true;
  }
  const derniereRevision = historique[historique.length - 1];
  const seuil = SEUILS_REVISION[mot.niveauMaitrise] || SEUILS_REVISION.nouveau;
  const diffJours = (maintenant - new Date(derniereRevision.date)) / (1000 * 60 * 60 * 24);
  return diffJours >= seuil;
}

/**
 * Sélectionne les mots à réviser, éventuellement restreints à une catégorie
 * (en incluant ses sous-catégories).
 * @param {Array<Object>} mots
 * @param {string} idCategorie - '' pour toutes les catégories
 * @param {Array<Object>} categories
 * @returns {Array<Object>}
 */
function selectionnerMotsAReviser(mots, idCategorie, categories) {
  let idsCategorie = null;
  if (idCategorie) {
    idsCategorie = obtenirIdsCategorieEtSousCategories(idCategorie, categories);
  }

  return mots.filter((mot) => {
    const correspondCategorie = !idsCategorie
      || (mot.categorieIds || []).some((id) => idsCategorie.has(id));
    return correspondCategorie && estAReviser(mot);
  });
}

/**
 * Calcule le nouveau niveau de maîtrise selon la règle d'auto-évaluation.
 * @param {string} niveauActuel
 * @param {string} resultat - 'facile', 'difficile' ou 'echec'
 * @returns {string}
 */
function calculerNouveauNiveau(niveauActuel, resultat) {
  if (resultat === 'echec') {
    return 'nouveau';
  }
  if (resultat === 'difficile') {
    return 'en_cours';
  }
  if (resultat === 'facile') {
    if (niveauActuel === 'nouveau') return 'en_cours';
    if (niveauActuel === 'en_cours') return 'acquis';
    return niveauActuel; // « acquis » reste « acquis »
  }
  return niveauActuel;
}

/**
 * Enregistre une évaluation : ajoute à l'historique, met à jour dateModification
 * et le niveau de maîtrise, puis persiste en IndexedDB.
 * @param {Object} mot
 * @param {string} resultat
 * @returns {Promise<Object>} Le mot mis à jour
 */
function enregistrerEvaluation(mot, resultat) {
  const maintenant = new Date().toISOString();
  const motMaj = {
    ...mot,
    niveauMaitrise: calculerNouveauNiveau(mot.niveauMaitrise, resultat),
    dateModification: maintenant,
    historiqueRevision: [...(mot.historiqueRevision || []), { date: maintenant, resultat }]
  };
  return modifierMot(motMaj).then(() => motMaj);
}

/**
 * Affiche l'écran de révision (accueil, session en cours ou fin de session).
 */
function afficherEcranRevision() {
  if (sessionEnCours && sessionIndex < sessionMots.length) {
    afficherSessionRevision();
  } else if (sessionEnCours) {
    afficherFinRevision();
  } else {
    afficherAccueilRevision();
  }
}

/**
 * Accueil : nombre de mots à réviser, filtre par catégorie, bouton démarrer.
 */
function afficherAccueilRevision() {
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const conteneur = document.getElementById('contenu-revision');

      // Conserve le filtre choisi avant de reconstruire l'écran
      const selectPrecedent = document.getElementById('filtre-categorie-revision');
      const ancienneValeur = selectPrecedent ? selectPrecedent.value : '';

      conteneur.innerHTML = '';

      // Filtre par catégorie (arbre complet, comme l'écran Liste)
      const select = document.createElement('select');
      select.id = 'filtre-categorie-revision';
      select.setAttribute('aria-label', 'Filtrer la révision par catégorie');
      remplirOptionsFiltreCategorie(select, categories);
      if (ancienneValeur && categories.some((c) => c.id === ancienneValeur)) {
        select.value = ancienneValeur;
      }
      select.addEventListener('change', () => afficherAccueilRevision());

      const motsAReviser = selectionnerMotsAReviser(mots, select.value, categories);

      const compteur = document.createElement('p');
      compteur.className = 'revision-compteur';
      compteur.textContent = motsAReviser.length === 0
        ? 'Aucun mot à réviser. Bravo !'
        : `${motsAReviser.length} mot(s) à réviser aujourd'hui.`;

      const label = document.createElement('label');
      label.htmlFor = 'filtre-categorie-revision';
      label.textContent = 'Catégorie';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-demarrer-revision';
      btn.textContent = 'Démarrer la révision';
      btn.disabled = motsAReviser.length === 0;
      btn.addEventListener('click', demarrerRevision);

      conteneur.append(compteur, label, select, btn);
    })
    .catch((erreur) => console.error('Erreur lors du chargement de l\'écran de révision', erreur));
}

/**
 * Démarre une session avec les mots à réviser (filtrés par la catégorie choisie).
 */
function demarrerRevision() {
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const select = document.getElementById('filtre-categorie-revision');
      sessionMots = selectionnerMotsAReviser(mots, select ? select.value : '', categories);
      sessionIndex = 0;
      sessionCompteur = { facile: 0, difficile: 0, echec: 0 };
      sessionEnCours = sessionMots.length > 0;

      if (sessionMots.length === 0) {
        afficherAccueilRevision();
        return;
      }
      afficherSessionRevision();
    })
    .catch((erreur) => console.error('Erreur au démarrage de la révision', erreur));
}

/**
 * Session : affiche le mot seul, puis la définition et l'auto-évaluation après révélation.
 */
function afficherSessionRevision() {
  // Fin de session : plus de mot à présenter
  if (sessionIndex >= sessionMots.length) {
    afficherFinRevision();
    return;
  }

  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';

  const mot = sessionMots[sessionIndex];

  const div = document.createElement('div');
  div.className = 'revision-session';

  const progres = document.createElement('p');
  progres.className = 'revision-progres';
  progres.textContent = `Mot ${sessionIndex + 1} / ${sessionMots.length}`;

  const motEl = document.createElement('p');
  motEl.className = 'revision-mot';
  motEl.textContent = mot.mot;

  const btnVoir = document.createElement('button');
  btnVoir.type = 'button';
  btnVoir.id = 'btn-voir-definition';
  btnVoir.textContent = 'Voir la définition';

  const definitionEl = document.createElement('p');
  definitionEl.className = 'revision-definition';
  definitionEl.hidden = true;
  definitionEl.textContent = mot.definition || '(aucune définition)';

  const evaluationEl = document.createElement('div');
  evaluationEl.className = 'revision-evaluation';
  evaluationEl.hidden = true;

  const libelles = { facile: 'Facile', difficile: 'Difficile', echec: 'Échec' };
  Object.keys(libelles).forEach((resultat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-revision btn-${resultat}`;
    btn.textContent = libelles[resultat];
    btn.addEventListener('click', () => repondreRevision(mot, resultat));
    evaluationEl.appendChild(btn);
  });

  btnVoir.addEventListener('click', () => {
    definitionEl.hidden = false;
    btnVoir.hidden = true;
    evaluationEl.hidden = false;
  });

  div.append(progres, motEl, btnVoir, definitionEl, evaluationEl);
  conteneur.appendChild(div);
}

/**
 * Traite l'auto-évaluation puis passe au mot suivant.
 * @param {Object} mot
 * @param {string} resultat
 */
function repondreRevision(mot, resultat) {
  sessionCompteur[resultat]++;
  enregistrerEvaluation(mot, resultat)
    .then(() => {
      sessionIndex++;
      afficherSessionRevision();
    })
    .catch((erreur) => console.error('Erreur lors de l\'enregistrement de l\'évaluation', erreur));
}

/**
 * Fin de session : résumé des mots révisés et répartition des évaluations.
 */
function afficherFinRevision() {
  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'revision-fin';

  const titre = document.createElement('h2');
  titre.textContent = 'Session terminée !';

  const resume = document.createElement('p');
  resume.textContent = `${sessionMots.length} mot(s) révisé(s) : ` +
    `${sessionCompteur.facile} facile(s), ${sessionCompteur.difficile} difficile(s), ${sessionCompteur.echec} échec(s).`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Terminer';
  btn.addEventListener('click', () => {
    sessionEnCours = false;
    afficherEcranRevision();
  });

  div.append(titre, resume, btn);
  conteneur.appendChild(div);
}
