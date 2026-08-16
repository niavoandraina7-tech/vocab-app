// revision.js — système de révision (liste à réviser, auto-évaluation par mot)

// Seuils de révision en jours selon le niveau de maîtrise
const SEUILS_REVISION = { nouveau: 3, en_cours: 7, acquis: 14 };

// Mot actuellement en cours de révision (null = aucun)
let motEnRevision = null;

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
 * Point d'entrée principal : affiche la liste des mots à réviser (avec filtre).
 * C'est l'écran par défaut de l'onglet Révision.
 */
function afficherEcranRevision() {
  // Si un mot est en cours de révision, on affiche sa session
  if (motEnRevision) {
    afficherSessionRevisionMot(motEnRevision);
    return;
  }
  // Sinon, on affiche la liste (accueil)
  afficherListeMotsAReviser();
}

/**
 * Affiche la liste des mots à réviser + filtre catégorie.
 * Chaque mot est cliquable pour démarrer sa révision individuelle.
 */
function afficherListeMotsAReviser() {
  // Si une session de quiz était en cours, on l'arrête proprement
  if (typeof arreterQuiz === 'function') {
    arreterQuiz();
  }

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
      // Quand le filtre change, on rafraîchit seulement la liste
      select.addEventListener('change', () => mettreAJourListeMotsAReviser(select.value, mots, categories));

      // Sélection initiale : toutes les catégories (valeur vide) ou la valeur conservée
      const filtreInitial = ancienneValeur || '';
      const motsAReviser = selectionnerMotsAReviser(mots, filtreInitial, categories);

      // Compteur + label filtre
      const compteur = document.createElement('p');
      compteur.className = 'revision-compteur';
      compteur.textContent = motsAReviser.length === 0
        ? 'Aucun mot à réviser aujourd\'hui, bien joué !'
        : `${motsAReviser.length} mot(s) à réviser aujourd'hui.`;

      // Bouton quiz : accès au mode « jeu » (V2), à côté de la révision classique
      const btnQuiz = document.createElement('button');
      btnQuiz.type = 'button';
      btnQuiz.id = 'btn-lancer-quiz';
      btnQuiz.className = 'btn-quiz-lancer';
      btnQuiz.textContent = '🎮 Lancer un quiz';
      btnQuiz.addEventListener('click', afficherConfigQuiz);

      const label = document.createElement('label');
      label.htmlFor = 'filtre-categorie-revision';
      label.textContent = 'Filtrer par catégorie (optionnel)';

      // Conteneur pour la liste des mots à réviser
      const listeConteneur = document.createElement('div');
      listeConteneur.id = 'liste-mots-revision';
      listeConteneur.className = 'liste-mots-revision';
      rendreListeMotsAReviser(listeConteneur, motsAReviser, categories, true); // true = cliquable pour réviser

      conteneur.append(compteur, btnQuiz, label, select, listeConteneur);
    })
    .catch((erreur) => console.error('Erreur lors du chargement de l\'écran de révision', erreur));
}

/**
 * Met à jour la liste des mots à réviser quand le filtre change (sans recharger tout l'écran).
 * @param {string} idCategorie - ID de la catégorie filtrée (vide = toutes)
 * @param {Array<Object>} mots - Tous les mots (déjà chargés)
 * @param {Array<Object>} categories - Toutes les catégories (déjà chargées)
 */
function mettreAJourListeMotsAReviser(idCategorie, mots, categories) {
  const motsAReviser = selectionnerMotsAReviser(mots, idCategorie, categories);
  const listeConteneur = document.getElementById('liste-mots-revision');
  const compteur = document.querySelector('.revision-compteur');

  if (compteur) {
    compteur.textContent = motsAReviser.length === 0
      ? 'Aucun mot à réviser aujourd\'hui, bien joué !'
      : `${motsAReviser.length} mot(s) à réviser aujourd'hui.`;
  }
  rendreListeMotsAReviser(listeConteneur, motsAReviser, categories, true);
}

/**
 * Rend la liste des mots à réviser dans le conteneur donné.
 * @param {HTMLElement} conteneur
 * @param {Array<Object>} motsAReviser
 * @param {Array<Object>} categories
 * @param {boolean} cliquable - Si true, clic sur un mot ouvre sa révision
 */
function rendreListeMotsAReviser(conteneur, motsAReviser, categories, cliquable = false) {
  conteneur.innerHTML = '';

  if (motsAReviser.length === 0) {
    const message = document.createElement('p');
    message.className = 'revision-liste-vide';
    message.textContent = 'Aucun mot à réviser pour ce filtre.';
    conteneur.appendChild(message);
    return;
  }

  const nomsCategories = new Map(categories.map((c) => [c.id, c.nom]));

  // Tri : plus anciens en révision d'abord (ceux qui attendent depuis le plus longtemps)
  const motsTries = [...motsAReviser].sort((a, b) => {
    const histA = a.historiqueRevision || [];
    const histB = b.historiqueRevision || [];
    const dateA = histA.length > 0 ? new Date(histA[histA.length - 1].date).getTime() : new Date(a.dateCreation).getTime();
    const dateB = histB.length > 0 ? new Date(histB[histB.length - 1].date).getTime() : new Date(b.dateCreation).getTime();
    return dateA - dateB;
  });

  const ul = document.createElement('ul');
  ul.className = 'liste-mots-revision-ul';

  motsTries.forEach((mot) => {
    const li = document.createElement('li');
    li.className = 'entree-mot-revision' + (cliquable ? ' cliquable' : '');

    const motEl = document.createElement('div');
    motEl.className = 'mot-titre-revision';
    motEl.textContent = mot.mot;

    const badge = document.createElement('span');
    badge.className = `badge badge-${mot.niveauMaitrise || 'nouveau'}`;
    badge.textContent = libelleNiveau(mot.niveauMaitrise || 'nouveau');

    const detail = document.createElement('div');
    detail.className = 'mot-detail-revision';
    detail.textContent = mot.definition || '(aucune définition)';

    const nomsCategorie = (mot.categorieIds || [])
      .map((id) => nomsCategories.get(id))
      .filter(Boolean)
      .join(', ');

    let categoriesEl = null;
    if (nomsCategorie) {
      categoriesEl = document.createElement('div');
      categoriesEl.className = 'mot-categories-revision';
      categoriesEl.textContent = nomsCategorie;
    }

    // Indicateur "depuis combien de temps" pour la révision
    const historique = mot.historiqueRevision || [];
    let indicateurTemps = '';
    if (historique.length > 0) {
      const derniereRevision = new Date(historique[historique.length - 1].date);
      const diffJours = Math.floor((Date.now() - derniereRevision.getTime()) / (1000 * 60 * 60 * 24));
      indicateurTemps = `Dernière révision : il y a ${diffJours} jour(s)`;
    } else {
      const dateCreation = new Date(mot.dateCreation);
      const diffJours = Math.floor((Date.now() - dateCreation.getTime()) / (1000 * 60 * 60 * 24));
      indicateurTemps = `Jamais révisé (créé il y a ${diffJours} jour(s))`;
    }
    const tempsEl = document.createElement('div');
    tempsEl.className = 'mot-temps-revision';
    tempsEl.textContent = indicateurTemps;

    li.append(motEl, badge, detail);
    if (categoriesEl) li.append(categoriesEl);
    li.append(tempsEl);

    // Clic sur le mot → ouvre sa révision individuelle
    if (cliquable) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => ouvrirRevisionMot(mot));
    }

    ul.appendChild(li);
  });

  conteneur.appendChild(ul);
}

/**
 * Ouvre la session de révision pour un mot unique.
 * @param {Object} mot
 */
function ouvrirRevisionMot(mot) {
  motEnRevision = mot;
  afficherSessionRevisionMot(mot);
}

/**
 * Affiche la session de révision pour un mot unique.
 * @param {Object} mot
 */
function afficherSessionRevisionMot(mot) {
  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'revision-session-mot';

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
    btn.addEventListener('click', () => repondreRevisionMotUnique(mot, resultat));
    evaluationEl.appendChild(btn);
  });

  btnVoir.addEventListener('click', () => {
    definitionEl.hidden = false;
    btnVoir.hidden = true;
    evaluationEl.hidden = false;
  });

  div.append(motEl, btnVoir, definitionEl, evaluationEl);
  conteneur.appendChild(div);
}

/**
 * Traite l'auto-évaluation d'un mot unique, puis revient à la liste.
 * @param {Object} mot
 * @param {string} resultat
 */
function repondreRevisionMotUnique(mot, resultat) {
  enregistrerEvaluation(mot, resultat)
    .then(() => {
      motEnRevision = null;
      afficherListeMotsAReviser(); // Retour à la liste mise à jour
    })
    .catch((erreur) => console.error('Erreur lors de l\'enregistrement de l\'évaluation', erreur));
}

/**
 * Traduit un niveau de maîtrise en libellé lisible.
 * @param {string} niveau - 'nouveau', 'en_cours' ou 'acquis'
 * @returns {string}
 */
function libelleNiveau(niveau) {
  const libelles = { nouveau: 'Nouveau', en_cours: 'En cours', acquis: 'Acquis' };
  return libelles[niveau] || niveau;
}
