// quiz.js — quiz chronométré (mode « jeu » de l'onglet Jeu)
//
// Déroulement : l'onglet Jeu affiche un accueil avec un bouton « Lancer le
// quiz » → le quiz démarre directement sur tous les mots à réviser : pour
// chaque mot, affichage seul + compte à rebours 30 s → révélation de la
// définition → « Je savais » / « Je ne savais pas » → score final.
// Les réponses passent par la MÊME fonction enregistrerEvaluation que la
// session classique (V1) : les deux systèmes partagent les mêmes données.

const DUREE_QUESTION_SECONDES = 30;

// État de la session de quiz en cours (null = aucun quiz actif)
let sessionQuiz = null;

/**
 * Arrête proprement le minuteur du quiz s'il est actif.
 * Appelé quand on quitte l'écran de révision (navigation) ou qu'on
 * revient à l'accueil de la révision.
 */
function arreterQuiz() {
  if (sessionQuiz && sessionQuiz.minuteur) {
    clearInterval(sessionQuiz.minuteur);
    sessionQuiz.minuteur = null;
  }
}

/**
 * Accueil de l'onglet « Jeu » : un bouton « Lancer le quiz » démarre
 * directement le quiz sur tous les mots à réviser, sans choix de nombre.
 * La révision classique reste accessible en secondaire.
 */
function afficherAccueilJeu() {
  arreterQuiz();
  sessionQuiz = null;

  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';

  const titre = document.createElement('h2');
  titre.className = 'quiz-titre';
  titre.textContent = 'Quiz chronométré';

  const intro = document.createElement('p');
  intro.className = 'quiz-intro';
  intro.textContent = 'Un mot s\'affiche seul : réfléchissez à sa définition pendant 30 secondes, puis révélez et dites si vous le saviez ou non.';

  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const motsAReviser = selectionnerMotsAReviser(mots, '', categories);

      const info = document.createElement('p');
      info.className = 'quiz-info';
      info.textContent = motsAReviser.length === 0
        ? 'Aucun mot à réviser pour le moment : ajoutez des mots ou revenez après une révision pour lancer un quiz.'
        : `${motsAReviser.length} mot(s) à réviser disponible(s).`;

      const btnQuiz = document.createElement('button');
      btnQuiz.type = 'button';
      btnQuiz.id = 'btn-lancer-quiz';
      btnQuiz.className = 'btn-quiz-lancer';
      btnQuiz.textContent = '🎮 Lancer le quiz';
      btnQuiz.disabled = motsAReviser.length === 0;
      btnQuiz.addEventListener('click', lancerQuiz);

      // Accès secondaire à la révision classique (liste + programmation des dates)
      const btnRevisionClassique = document.createElement('button');
      btnRevisionClassique.type = 'button';
      btnRevisionClassique.className = 'btn-retour';
      btnRevisionClassique.textContent = '📋 Révision classique';
      btnRevisionClassique.title = 'Voir la liste des mots à réviser et programmer les dates de révision';
      btnRevisionClassique.addEventListener('click', afficherListeMotsAReviser);

      conteneur.append(titre, intro, info, btnQuiz, btnRevisionClassique);
    })
    .catch((erreur) => console.error('Erreur lors du chargement de l\'accueil du jeu', erreur));
}

/**
 * Lance directement le quiz sur tous les mots à réviser (mélangés).
 * Ne fait rien s'il n'y a aucun mot à réviser (le bouton est alors désactivé).
 */
function lancerQuiz() {
  arreterQuiz();
  sessionQuiz = null;

  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const motsAReviser = selectionnerMotsAReviser(mots, '', categories);
      if (motsAReviser.length === 0) {
        afficherAccueilJeu();
        return;
      }
      const motsMelanges = [...motsAReviser].sort(() => Math.random() - 0.5);
      demarrerQuiz(motsMelanges);
    })
    .catch((erreur) => console.error('Erreur lors du lancement du quiz', erreur));
}

/**
 * Démarre la session de quiz sur tous les mots donnés (déjà mélangés).
 * @param {Array<Object>} mots - Mots à réviser (mélangés)
 */
function demarrerQuiz(mots) {
  if (mots.length === 0) {
    return;
  }
  sessionQuiz = {
    mots,
    index: 0,
    score: 0,
    minuteur: null,
    secondesRestantes: DUREE_QUESTION_SECONDES,
    revele: false
  };
  afficherQuestionQuiz();
}

/**
 * Affiche une question : mot seul + compte à rebours + bouton « J'ai fini ».
 */
function afficherQuestionQuiz() {
  const quiz = sessionQuiz;
  if (!quiz) {
    return;
  }
  const mot = quiz.mots[quiz.index];
  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';
  quiz.repondu = false; // autorise à nouveau une réponse pour cette question

  const progres = document.createElement('p');
  progres.className = 'quiz-progres';
  progres.textContent = `Question ${quiz.index + 1} / ${quiz.mots.length}`;

  const motEl = document.createElement('p');
  motEl.className = 'quiz-mot';
  motEl.textContent = mot.mot;

  const zoneTemps = document.createElement('div');
  zoneTemps.className = 'quiz-zone-temps';

  const chiffre = document.createElement('span');
  chiffre.className = 'quiz-chiffre';
  chiffre.textContent = String(DUREE_QUESTION_SECONDES);

  const barre = document.createElement('div');
  barre.className = 'quiz-barre-temps';
  const remplissage = document.createElement('div');
  remplissage.className = 'quiz-remplissage';
  remplissage.style.width = '100%';
  barre.appendChild(remplissage);

  zoneTemps.append(chiffre, barre);

  const btnFini = document.createElement('button');
  btnFini.type = 'button';
  btnFini.id = 'btn-j-ai-fini';
  btnFini.textContent = 'J\'ai fini';
  btnFini.addEventListener('click', revelerDefinitionQuiz);

  conteneur.append(progres, motEl, zoneTemps, btnFini);

  // Compte à rebours : 30 secondes, mis à jour chaque seconde
  quiz.secondesRestantes = DUREE_QUESTION_SECONDES;
  quiz.revele = false;
  quiz.minuteur = setInterval(() => {
    quiz.secondesRestantes--;
    if (quiz.secondesRestantes <= 0) {
      quiz.secondesRestantes = 0;
      clearInterval(quiz.minuteur);
      quiz.minuteur = null;
      revelerDefinitionQuiz();
      return;
    }
    chiffre.textContent = String(quiz.secondesRestantes);
    remplissage.style.width = `${(quiz.secondesRestantes / DUREE_QUESTION_SECONDES) * 100}%`;
    if (quiz.secondesRestantes <= 10) {
      chiffre.classList.add('quiz-urgent');
    }
  }, 1000);
}

/**
 * Révèle la définition du mot courant et affiche les boutons de réponse.
 */
function revelerDefinitionQuiz() {
  const quiz = sessionQuiz;
  if (!quiz || quiz.revele) {
    return;
  }
  quiz.revele = true;
  if (quiz.minuteur) {
    clearInterval(quiz.minuteur);
    quiz.minuteur = null;
  }

  const mot = quiz.mots[quiz.index];
  const conteneur = document.getElementById('contenu-revision');

  // Retire la zone de temps et le bouton « J'ai fini »
  const zoneTemps = conteneur.querySelector('.quiz-zone-temps');
  const btnFini = document.getElementById('btn-j-ai-fini');
  if (zoneTemps) zoneTemps.remove();
  if (btnFini) btnFini.remove();

  const definition = document.createElement('p');
  definition.className = 'quiz-definition';
  definition.textContent = mot.definition || '(aucune définition)';

  const reponse = document.createElement('div');
  reponse.className = 'quiz-reponse';

  const btnSavais = document.createElement('button');
  btnSavais.type = 'button';
  btnSavais.className = 'btn-quiz-je-savais';
  btnSavais.textContent = 'Je savais';
  btnSavais.addEventListener('click', () => repondreQuiz(true));

  const btnPasSavais = document.createElement('button');
  btnPasSavais.type = 'button';
  btnPasSavais.className = 'btn-quiz-pas-su';
  btnPasSavais.textContent = 'Je ne savais pas';
  btnPasSavais.addEventListener('click', () => repondreQuiz(false));

  reponse.append(btnSavais, btnPasSavais);
  conteneur.append(definition, reponse);
}

/**
 * Traite la réponse du quiz : met à jour le score et le mot via la même
 * logique que la session classique (enregistrerEvaluation), puis avance.
 * @param {boolean} su - true si « Je savais », false sinon
 */
function repondreQuiz(su) {
  const quiz = sessionQuiz;
  // Garde contre un double-clic rapide : on ne traite qu'une seule réponse par question
  if (!quiz || quiz.repondu) {
    return;
  }
  quiz.repondu = true;
  const mot = quiz.mots[quiz.index];
  if (su) {
    quiz.score++;
  }

  enregistrerEvaluation(mot, su ? 'facile' : 'echec')
    .then(() => {
      quiz.index++;
      if (quiz.index >= quiz.mots.length) {
        afficherResultatQuiz();
      } else {
        afficherQuestionQuiz();
      }
    })
    .catch((erreur) => console.error('Erreur lors de l\'enregistrement de la réponse du quiz', erreur));
}

/**
 * Écran de résultat : score X/Y, message selon le pourcentage, actions.
 */
function afficherResultatQuiz() {
  const quiz = sessionQuiz;
  const total = quiz.mots.length;
  const score = quiz.score;
  const pourcentage = total > 0 ? Math.round((score / total) * 100) : 0;

  let message;
  if (pourcentage >= 80) {
    message = 'Excellent !';
  } else if (pourcentage >= 50) {
    message = 'Bien joué';
  } else {
    message = 'Continue, ça va venir';
  }

  const conteneur = document.getElementById('contenu-revision');
  conteneur.innerHTML = '';

  const titre = document.createElement('h2');
  titre.className = 'quiz-resultat-titre';
  titre.textContent = 'Quiz terminé !';

  const scoreEl = document.createElement('p');
  scoreEl.className = 'quiz-resultat-score';
  scoreEl.textContent = `${score}/${total}`;

  const messageEl = document.createElement('p');
  messageEl.className = 'quiz-resultat-message';
  messageEl.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'quiz-resultat-actions';

  const btnRejouer = document.createElement('button');
  btnRejouer.type = 'button';
  btnRejouer.textContent = '🎮 Rejouer un quiz';
  btnRejouer.addEventListener('click', lancerQuiz);

  const btnRevisionClassique = document.createElement('button');
  btnRevisionClassique.type = 'button';
  btnRevisionClassique.className = 'btn-secondaire';
  btnRevisionClassique.textContent = '📋 Révision classique';
  btnRevisionClassique.addEventListener('click', () => {
    sessionQuiz = null;
    afficherListeMotsAReviser();
  });

  actions.append(btnRejouer, btnRevisionClassique);
  conteneur.append(titre, scoreEl, messageEl, actions);
}
