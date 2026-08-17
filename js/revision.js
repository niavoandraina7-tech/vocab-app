// revision.js — système de révision (liste à réviser, auto-évaluation par mot)

// Seuils de révision « hérités » en jours — utilisés uniquement pour amorcer les
// mots créés avant la révision espacée SM-2 (et comme repli si un mot n'a pas
// encore de prochaine révision programmée). Depuis, les intervalles sont calculés
// par l'algorithme SM-2 (voir appliquerSM2 ci-dessous).
const SEUILS_REVISION = { nouveau: 3, en_cours: 7, acquis: 14 };

// ---- Révision espacée (SM-2) ----
// Chaque mot porte son état d'apprentissage :
//   repetition      : nombre de succès consécutifs (remis à 0 après un échec)
//   easeFacteur     : facteur de facilité (2.5 initial, plancher 1.3)
//   intervalleJours : intervalle calculé (null = jamais calculé, mot « hérité »)
// Intervalles : I(1) = 1 jour, I(2) = 6 jours, I(n) = arrondi(I(n-1) × EF).
const EASE_FACTEUR_INITIAL = 2.5;
const EASE_FACTEUR_MIN = 1.3;
const INTERVALLE_APRES_ECHEC_JOURS = 1;

/**
 * Qualité (0-5) correspondant à une auto-évaluation utilisateur.
 * @param {string} resultat - 'facile', 'difficile' ou 'echec'
 * @returns {number}
 */
function qualiteSM2(resultat) {
  if (resultat === 'facile') return 5;
  if (resultat === 'difficile') return 3;
  return 1; // echec
}

/**
 * Met à jour le facteur de facilité (formule SM-2).
 * @param {number} easeFacteur
 * @param {number} qualite - 0 à 5
 * @returns {number}
 */
function majEaseFacteur(easeFacteur, qualite) {
  const ecart = 5 - qualite;
  const delta = 0.1 - ecart * (0.08 + ecart * 0.02);
  return Math.max(EASE_FACTEUR_MIN, easeFacteur + delta);
}

/**
 * Intervalle en jours selon la répétition (SM-2) : 1, 6, puis ×EF.
 * @param {number} repetition - Nombre de succès consécutifs APRÈS cette évaluation
 * @param {number|null} intervallePrecedent
 * @param {number} easeFacteur
 * @returns {number}
 */
function calculerIntervalleSM2(repetition, intervallePrecedent, easeFacteur) {
  if (repetition === 1) return 1;
  if (repetition === 2) return 6;
  return Math.max(1, Math.round((intervallePrecedent || 6) * easeFacteur));
}

/**
 * État SM-2 initial d'un mot « hérité » (créé avant SM-2), déduit de son
 * niveau de maîtrise existant pour une transition sans à-coup.
 * @param {Object} mot
 * @returns {{repetition: number, easeFacteur: number, intervalleJours: number}}
 */
function amorcerEtatSM2(mot) {
  const seedRepetition = { nouveau: 0, en_cours: 1, acquis: 3 };
  return {
    repetition: seedRepetition[mot.niveauMaitrise] || 0,
    easeFacteur: EASE_FACTEUR_INITIAL,
    intervalleJours: SEUILS_REVISION[mot.niveauMaitrise] || SEUILS_REVISION.nouveau
  };
}

/**
 * Applique SM-2 à un mot pour une auto-évaluation.
 * @param {Object} mot
 * @param {string} resultat - 'facile', 'difficile' ou 'echec'
 * @returns {{repetition: number, easeFacteur: number, intervalleJours: number, niveauMaitrise: string}}
 */
function appliquerSM2(mot, resultat) {
  const herite = mot.intervalleJours === undefined || mot.intervalleJours === null;
  const etat = herite
    ? amorcerEtatSM2(mot)
    : {
        repetition: mot.repetition || 0,
        easeFacteur: mot.easeFacteur || EASE_FACTEUR_INITIAL,
        intervalleJours: mot.intervalleJours
      };

  let { repetition, easeFacteur, intervalleJours } = etat;

  if (resultat === 'echec') {
    repetition = 0;
    intervalleJours = INTERVALLE_APRES_ECHEC_JOURS;
  } else {
    repetition += 1;
    intervalleJours = calculerIntervalleSM2(repetition, intervalleJours, easeFacteur);
  }
  easeFacteur = majEaseFacteur(easeFacteur, qualiteSM2(resultat));

  // Niveau de maîtrise dérivé de l'état SM-2 (alimente les badges et filtres existants)
  const niveauMaitrise = repetition === 0 ? 'nouveau' : (repetition <= 2 ? 'en_cours' : 'acquis');
  return { repetition, easeFacteur, intervalleJours, niveauMaitrise };
}

// Mot actuellement en cours de révision (null = aucun)
let motEnRevision = null;

/**
 * Un mot est « à réviser » s'il n'a jamais été révisé, si sa prochaine
 * révision programmée est atteinte (ou dépassée), ou — pour les mots créés
 * avant la programmation — si sa dernière révision date de plus du seuil
 * (en jours) de son niveau.
 * @param {Object} mot
 * @param {Date} maintenant - Date de référence (utile pour les tests)
 * @returns {boolean}
 */
function estAReviser(mot, maintenant = new Date()) {
  // Une prochaine révision explicitement programmée fait foi
  if (mot.prochaineRevision) {
    return parserDateRevision(mot.prochaineRevision) <= maintenant;
  }
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
 * Filtre les mots appartenant à une catégorie (en incluant ses sous-catégories).
 * @param {Array<Object>} mots
 * @param {string} idCategorie - '' pour toutes les catégories
 * @param {Array<Object>} categories
 * @returns {Array<Object>}
 */
function filtrerMotsParCategorie(mots, idCategorie, categories) {
  if (!idCategorie) {
    return mots;
  }
  const idsCategorie = obtenirIdsCategorieEtSousCategories(idCategorie, categories);
  return mots.filter((mot) => (mot.categorieIds || []).some((id) => idsCategorie.has(id)));
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
  return filtrerMotsParCategorie(mots, idCategorie, categories).filter((mot) => estAReviser(mot));
}

/**
 * Enregistre une évaluation : applique SM-2 (répétition, facteur de facilité,
 * intervalle), ajoute à l'historique, met à jour dateModification, le niveau de
 * maîtrise dérivé et la prochaine révision, puis persiste en IndexedDB.
 * @param {Object} mot
 * @param {string} resultat
 * @returns {Promise<Object>} Le mot mis à jour
 */
function enregistrerEvaluation(mot, resultat) {
  const maintenant = new Date();
  const sm2 = appliquerSM2(mot, resultat);
  const prochaine = new Date(maintenant.getTime() + sm2.intervalleJours * 24 * 60 * 60 * 1000);
  const motMaj = {
    ...mot,
    niveauMaitrise: sm2.niveauMaitrise,
    repetition: sm2.repetition,
    easeFacteur: sm2.easeFacteur,
    intervalleJours: sm2.intervalleJours,
    dateModification: maintenant.toISOString(),
    prochaineRevision: prochaine.toISOString(),
    historiqueRevision: [...(mot.historiqueRevision || []), { date: maintenant.toISOString(), resultat }]
  };
  return modifierMot(motMaj).then(() => motMaj);
}

/**
 * Point d'entrée principal : l'onglet « Jeu » affiche l'accueil du quiz
 * (bouton « Lancer le quiz »), pas le quiz directement.
 */
function afficherEcranRevision() {
  // Si un mot est en cours de révision individuelle, on reprend sa session
  if (motEnRevision) {
    afficherSessionRevisionMot(motEnRevision);
    return;
  }
  // Sinon, on affiche l'accueil du jeu (bouton de lancement du quiz)
  afficherAccueilJeu();
}

/**
 * Affiche la liste des mots de l'onglet Révision, en deux sections :
 * « À réviser » (mots arrivés à échéance) et « Prochaine révision »
 * (mots récemment révisés ou programmés, simplement retardés, jamais supprimés).
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

      // Retour vers l'onglet Jeu (accueil du quiz)
      const btnRetour = document.createElement('button');
      btnRetour.type = 'button';
      btnRetour.className = 'btn-retour';
      btnRetour.textContent = '← Retour au jeu';
      btnRetour.addEventListener('click', afficherAccueilJeu);

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

      const label = document.createElement('label');
      label.htmlFor = 'filtre-categorie-revision';
      label.textContent = 'Filtrer par catégorie (optionnel)';

      // Conteneur des deux sections de la liste
      const listeConteneur = document.createElement('div');
      listeConteneur.id = 'liste-mots-revision';
      listeConteneur.className = 'liste-mots-revision';
      rendreListesRevision(listeConteneur, mots, categories, filtreInitial);

      conteneur.append(btnRetour, compteur, label, select, listeConteneur);
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
  rendreListesRevision(listeConteneur, mots, categories, idCategorie);
}

/**
 * Rend les deux sections de la liste : « À réviser » puis « Prochaine révision ».
 * @param {HTMLElement} conteneur
 * @param {Array<Object>} mots - Tous les mots
 * @param {Array<Object>} categories
 * @param {string} idCategorie - Catégorie filtrée (vide = toutes)
 */
function rendreListesRevision(conteneur, mots, categories, idCategorie) {
  conteneur.innerHTML = '';

  const motsDeLaCategorie = filtrerMotsParCategorie(mots, idCategorie, categories);
  const aReviser = motsDeLaCategorie.filter((mot) => estAReviser(mot));
  const programmes = motsDeLaCategorie
    .filter((mot) => !estAReviser(mot))
    .sort((a, b) => obtenirProchaineRevisionDate(a) - obtenirProchaineRevisionDate(b));

  if (mots.length === 0) {
    const message = document.createElement('p');
    message.className = 'revision-liste-vide';
    message.textContent = 'Aucun mot pour le moment. Ajoutez votre premier mot !';
    conteneur.appendChild(message);
    return;
  }

  if (aReviser.length === 0 && programmes.length === 0) {
    const message = document.createElement('p');
    message.className = 'revision-liste-vide';
    message.textContent = 'Aucun mot à réviser pour ce filtre.';
    conteneur.appendChild(message);
    return;
  }

  if (aReviser.length > 0) {
    const titre = document.createElement('h3');
    titre.className = 'titre-section-revision';
    titre.textContent = `À réviser (${aReviser.length})`;
    const ul = document.createElement('ul');
    ul.className = 'liste-mots-revision-ul';
    aReviser.forEach((mot) => ul.appendChild(construireEntreeRevision(mot, categories, { cliquable: true })));
    conteneur.append(titre, ul);
  }

  if (programmes.length > 0) {
    const titre = document.createElement('h3');
    titre.className = 'titre-section-revision';
    titre.textContent = 'Prochaine révision';
    const ul = document.createElement('ul');
    ul.className = 'liste-mots-revision-ul';
    programmes.forEach((mot) => ul.appendChild(construireEntreeRevision(mot, categories, { programme: true })));
    conteneur.append(titre, ul);
  }
}

/**
 * Construit l'entrée (li) d'un mot dans la liste de révision.
 * @param {Object} mot
 * @param {Array<Object>} categories
 * @param {{cliquable?: boolean, programme?: boolean}} options
 * @returns {HTMLLIElement}
 */
function construireEntreeRevision(mot, categories, { cliquable = false, programme = false } = {}) {
  const li = document.createElement('li');
  li.className = 'entree-mot-revision' + (cliquable ? ' cliquable' : '') + (programme ? ' programme' : '');

  const motEl = document.createElement('div');
  motEl.className = 'mot-titre-revision';
  motEl.textContent = mot.mot;

  const badge = document.createElement('span');
  badge.className = `badge badge-${mot.niveauMaitrise || 'nouveau'}`;
  badge.textContent = libelleNiveau(mot.niveauMaitrise || 'nouveau');

  const detail = document.createElement('div');
  detail.className = 'mot-detail-revision';
  detail.textContent = mot.definition || '(aucune définition)';

  const nomsCategories = new Map(categories.map((c) => [c.id, c.nom]));
  const nomsCategorie = (mot.categorieIds || [])
    .map((id) => nomsCategories.get(id))
    .filter(Boolean)
    .join(', ');

  const tempsEl = document.createElement('div');
  tempsEl.className = 'mot-temps-revision';
  tempsEl.textContent = programme ? libelleProchaineRevision(mot) : libelleEnAttente(mot);

  const btnDate = creerBoutonDateRevision(mot);

  li.append(motEl, badge, detail);
  if (nomsCategorie) {
    const categoriesEl = document.createElement('div');
    categoriesEl.className = 'mot-categories-revision';
    categoriesEl.textContent = nomsCategorie;
    li.append(categoriesEl);
  }
  li.append(tempsEl, btnDate);

  // Clic sur un mot à réviser → ouvre sa révision individuelle
  if (cliquable) {
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => ouvrirRevisionMot(mot));
  }

  return li;
}

/**
 * Indicateur de temps d'un mot arrivé à échéance.
 * @param {Object} mot
 * @returns {string}
 */
function libelleEnAttente(mot) {
  const historique = mot.historiqueRevision || [];
  const dateReference = mot.prochaineRevision
    ? parserDateRevision(mot.prochaineRevision)
    : (historique.length > 0
        ? new Date(historique[historique.length - 1].date)
        : new Date(mot.dateCreation));
  const diffJours = Math.floor((Date.now() - dateReference.getTime()) / (1000 * 60 * 60 * 24));

  if (historique.length === 0 && !mot.prochaineRevision) {
    return diffJours <= 0
      ? 'Jamais révisé — à apprendre'
      : `Jamais révisé (créé il y a ${diffJours} jour(s))`;
  }
  if (diffJours <= 0) {
    return 'À réviser aujourd\'hui';
  }
  return `En retard de ${diffJours} jour(s)`;
}

/**
 * Indicateur de temps d'un mot programmé (révisé récemment, pas encore à échéance).
 * @param {Object} mot
 * @returns {string}
 */
function libelleProchaineRevision(mot) {
  const date = obtenirProchaineRevisionDate(mot);
  const texte = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const diffJours = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffJours <= 1) {
    return `Prochaine révision : demain (${texte})`;
  }
  if (diffJours <= 30) {
    return `Prochaine révision : ${texte} (dans ${diffJours} jours)`;
  }
  return `Prochaine révision : ${texte}`;
}

/**
 * Date de la prochaine révision d'un mot : la date programmée si elle existe,
 * sinon la dernière révision + le seuil du niveau (repli pour les anciens mots).
 * @param {Object} mot
 * @returns {Date}
 */
function obtenirProchaineRevisionDate(mot) {
  if (mot.prochaineRevision) {
    return parserDateRevision(mot.prochaineRevision);
  }
  const historique = mot.historiqueRevision || [];
  const seuil = SEUILS_REVISION[mot.niveauMaitrise] || SEUILS_REVISION.nouveau;
  const base = historique.length > 0
    ? new Date(historique[historique.length - 1].date)
    : new Date(mot.dateCreation);
  const date = new Date(base);
  date.setDate(date.getDate() + seuil);
  return date;
}

/**
 * Crée le bouton 📅 qui permet de programmer (ou modifier) la date de
 * révision d'un mot, directement depuis la liste.
 * @param {Object} mot
 * @returns {HTMLButtonElement}
 */
function creerBoutonDateRevision(mot) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'btn-date-revision';
  bouton.textContent = '📅';
  bouton.title = 'Programmer la prochaine révision';
  bouton.setAttribute('aria-label', `Programmer la prochaine révision de « ${mot.mot} »`);

  bouton.addEventListener('click', (evenement) => {
    evenement.stopPropagation(); // ne déclenche pas la révision du mot

    const editeur = document.createElement('div');
    editeur.className = 'editeur-date-revision';

    // Sélecteur de délai (Automatique ou 1..7 jours)
    const select = document.createElement('select');
    select.className = 'select-delai-revision';
    select.innerHTML = `
      <option value="">Automatique (selon le niveau)</option>
      <option value="1">Dans 1 jour</option>
      <option value="2">Dans 2 jours</option>
      <option value="3">Dans 3 jours</option>
      <option value="4">Dans 4 jours</option>
      <option value="5">Dans 5 jours</option>
      <option value="6">Dans 6 jours</option>
      <option value="7">Dans 7 jours</option>
    `;
    select.value = valeurPourSelectDelai(mot.prochaineRevision);

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.textContent = 'OK';
    btnOk.addEventListener('click', () => {
      const valeur = select.value;
      const dateAAJJMMJJ = valeur
        ? dateEnLocalAAJJMMJJ(new Date(Date.now() + parseInt(valeur, 10) * 24 * 60 * 60 * 1000))
        : '';
      sauvegarderProchaineRevision(mot, dateAAJJMMJJ)
        .then(() => afficherListeMotsAReviser())
        .catch((erreur) => console.error('Erreur lors de la programmation de la révision', erreur));
    });

    const btnAnnuler = document.createElement('button');
    btnAnnuler.type = 'button';
    btnAnnuler.className = 'btn-secondaire';
    btnAnnuler.textContent = 'Annuler';
    btnAnnuler.addEventListener('click', () => editeur.replaceWith(bouton));

    editeur.append(select, btnOk, btnAnnuler);
    bouton.replaceWith(editeur);
    select.focus();
  });

  return bouton;
}

/**
 * Enregistre la prochaine révision choisie pour un mot
 * (vide = programmation automatique selon le niveau).
 * @param {Object} mot
 * @param {string} dateAAJJMMJJ - « AAAA-MM-JJ » ou chaîne vide
 * @returns {Promise<Object>}
 */
function sauvegarderProchaineRevision(mot, dateAAJJMMJJ) {
  const motMaj = {
    ...mot,
    prochaineRevision: dateAAJJMMJJ || null,
    dateModification: new Date().toISOString()
  };
  return modifierMot(motMaj);
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
 * Le mot n'est pas supprimé : sa prochaine révision est simplement retardée.
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
