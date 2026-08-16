// quiz.js — quiz chronométré (mode « jeu » de l'onglet Révision)
//
// Déroulement : configuration (nombre de mots) → pour chaque mot : affichage
// du mot seul + compte à rebours 30 s → révélation de la définition →
// « Je savais » / « Je ne savais pas » → score final.
// Les réponses passent par la MÊME fonction enregistrerEvaluation que la
// session classique (V1) : les deux systèmes partagent les mêmes données.

const DUREE_QUESTION_SECONDES = 30;
const CHOIX_NOMBRES = [5, 10, 20];

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
 * Écran de configuration : choix du nombre de mots parmi ceux à réviser.
 */
function afficherConfigQuiz() {
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
      // Mêmes mots que la liste « à réviser » de la V1, mélangés pour la variété
      const motsAReviser = selectionnerMotsAReviser(mots, '', categories);
      const motsMelanges = [...motsAReviser].sort(() => Math.random() - 0.5);

      const info = document.createElement('p');
      info.className = 'quiz-info';
      info.textContent = `${motsAReviser.length} mot(s) à réviser disponible(s).`;

      const blocChoix = document.createElement('div');
      blocChoix.className = 'quiz-choix-nombre';

      const label = document.createElement('p');
      label.textContent = 'Nombre de mots :';
      blocChoix.appendChild(label);

      CHOIX_NOMBRES.forEach((nombre) => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'btn-quiz-choix';
        bouton.textContent = String(nombre);
        bouton.addEventListener('click', () => demarrerQuiz(motsMelanges, nombre));
        blocChoix.appendChild(bouton);
      });

      const boutonTous = document.createElement('button');
      boutonTous.type = 'button';
      boutonTous.className = 'btn-quiz-choix btn-quiz-tous';
      boutonTous.textContent = 'Tous les mots à réviser';
      boutonTous.addEventListener('click', () => demarrerQuiz(motsMelanges, motsMelanges.length));
      blocChoix.appendChild(boutonTous);

      if (motsAReviser.length === 0) {
        const aucun = document.createElement('p');
        aucun.className = 'quiz-info quiz-info-vide';
        aucun.textContent = 'Aucun mot à réviser pour le moment : ajoutez des mots ou revenez après une révision pour lancer un quiz.';
        blocChoix.appendChild(aucun);
      }

      const btnRetour = document.createElement('button');
      btnRetour.type = 'button';
      btnRetour.className = 'btn-retour';
      btnRetour.textContent = '← Retour à Révision';
      btnRetour.addEventListener('click', afficherListeMotsAReviser);

      conteneur.append(titre, intro, info, blocChoix, btnRetour);
    })
    .catch((erreur) => console.error('Erreur lors de la configuration du quiz', erreur));
}

/**
 * Démarre la session de quiz sur les mots donnés.
 * Si moins de mots sont disponibles que demandés, on prend tous les mots
 * disponibles et on le signale (note visible sur la première question).
 * @param {Array<Object>} motsDisponibles - Mots à réviser (mélangés)
 * @param {number} nombreDemande - Nombre de mots choisi par l'utilisateur
 */
function demarrerQuiz(motsDisponibles, nombreDemande) {
  if (motsDisponibles.length === 0) {
    return;
  }
  const nombre = Math.min(nombreDemande, motsDisponibles.length);
  sessionQuiz = {
    mots: motsDisponibles.slice(0, nombre),
    index: 0,
    score: 0,
    minuteur: null,
    secondesRestantes: DUREE_QUESTION_SECONDES,
    revele: false,
    reduit: nombre < nombreDemande
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

  const progres = document.createElement('p');
  progres.className = 'quiz-progres';
  progres.textContent = `Question ${quiz.index + 1} / ${quiz.mots.length}`;

  if (quiz.index === 0 && quiz.reduit) {
    const note = document.createElement('p');
    note.className = 'quiz-note-reduit';
    note.textContent = `Seulement ${quiz.mots.length} mot(s) disponible(s) : le quiz portera sur ${quiz.mots.length} mot(s).`;
    conteneur.appendChild(note);
  }

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
  if (!quiz) {
    return;
  }
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
  btnRejouer.textContent = 'Rejouer un quiz';
  btnRejouer.addEventListener('click', afficherConfigQuiz);

  const btnRetour = document.createElement('button');
  btnRetour.type = 'button';
  btnRetour.className = 'btn-secondaire';
  btnRetour.textContent = 'Retour à Révision';
  btnRetour.addEventListener('click', () => {
    sessionQuiz = null;
    afficherListeMotsAReviser();
  });

  actions.append(btnRejouer, btnRetour);
  conteneur.append(titre, scoreEl, messageEl, actions);
}
