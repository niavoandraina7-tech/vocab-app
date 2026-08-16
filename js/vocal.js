// vocal.js — transcription vocale (Web Speech API)
//
// Boutons micro sur les champs Mot / Définition / Exemple du formulaire.
// L'API SpeechRecognition n'est pas supportée partout (ex : Firefox) et
// nécessite généralement une connexion internet. Si elle est absente, les
// boutons sont masqués et le formulaire reste utilisable normalement.

const CLE_LANGUE_DICTEE = 'langueDictee';
const LANGUE_DICTEE_DEFAUT = 'fr-FR';

// Instance de reconnaissance en cours (null = aucune écoute active)
let reconnaissance = null;
// Bouton micro actuellement en écoute (null = aucun)
let boutonEnEcoute = null;
// Un message d'erreur est-il affiché ? (pour ne pas l'effacer dans onend)
let erreurAffichee = false;

/**
 * Le navigateur supporte-t-il la reconnaissance vocale ?
 * @returns {boolean}
 */
function supporterTranscription() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Langue de dictée choisie par l'utilisateur (persistée en localStorage).
 * @returns {string}
 */
function langueDictee() {
  return localStorage.getItem(CLE_LANGUE_DICTEE) || LANGUE_DICTEE_DEFAUT;
}

/**
 * Affiche un message de statut près du formulaire (écoute, erreur, etc.).
 * @param {string} message - Texte à afficher ('' pour masquer)
 * @param {string} type - 'info' (défaut) ou 'erreur'
 */
function afficherStatutVocal(message, type = 'info') {
  const statut = document.getElementById('statut-vocal');
  if (!statut) {
    return;
  }
  statut.textContent = message;
  statut.hidden = !message;
  statut.className = 'statut-vocal ' + (type === 'erreur' ? 'statut-erreur' : '');
}

/**
 * Ajoute le texte final reconnu au champ cible, sans écraser l'édition manuelle.
 * @param {string} idChamp - Identifiant du champ à remplir
 * @param {string} texte - Texte reconnu
 */
function insererTexteReconnu(idChamp, texte) {
  const champ = document.getElementById(idChamp);
  if (!champ || !texte) {
    return;
  }
  const valeurActuelle = champ.value.trimEnd();
  champ.value = valeurActuelle ? `${valeurActuelle} ${texte}` : texte;
  champ.focus();
}

/**
 * Remet le bouton micro en état de repos et libère la reconnaissance.
 */
function arreterEcoute() {
  if (reconnaissance) {
    try {
      reconnaissance.abort();
    } catch (erreur) {
      // La reconnaissance peut déjà être terminée : on ignore
    }
    reconnaissance = null;
  }
  if (boutonEnEcoute) {
    boutonEnEcoute.classList.remove('ecoute');
    boutonEnEcoute.setAttribute('aria-label', boutonEnEcoute.dataset.ariaRepos || boutonEnEcoute.title);
    boutonEnEcoute = null;
  }
  afficherStatutVocal('');
}

/**
 * Démarre l'écoute vocale pour le bouton micro cliqué.
 * Un second clic pendant l'écoute arrête la reconnaissance.
 * @param {HTMLButtonElement} bouton - Le bouton micro cliqué
 */
function demarrerEcoute(bouton) {
  // Second clic pendant l'écoute → arrêt
  if (boutonEnEcoute === bouton) {
    arreterEcoute();
    return;
  }

  // Une autre écoute est en cours sur un autre champ → on l'arrête d'abord
  if (boutonEnEcoute) {
    arreterEcoute();
  }

  const ClasseReconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;
  const reconnaissanceNouvelle = new ClasseReconnaissance();
  reconnaissance = reconnaissanceNouvelle;
  boutonEnEcoute = bouton;

  const idChamp = bouton.dataset.cible;
  reconnaissanceNouvelle.lang = langueDictee();
  reconnaissanceNouvelle.interimResults = true;
  reconnaissanceNouvelle.continuous = false;

  erreurAffichee = false;
  bouton.classList.add('ecoute');
  bouton.setAttribute('aria-label', 'Arrêter la dictée');
  afficherStatutVocal('Je vous écoute... parlez maintenant 🎤');

  // Résultats partiels affichés en direct, texte final inséré dans le champ
  reconnaissanceNouvelle.onresult = (evenement) => {
    let texteIntermediaire = '';
    let texteFinal = '';
    for (let i = evenement.resultIndex; i < evenement.results.length; i++) {
      const resultat = evenement.results[i];
      if (resultat.isFinal) {
        texteFinal += resultat[0].transcript;
      } else {
        texteIntermediaire += resultat[0].transcript;
      }
    }
    if (texteFinal) {
      insererTexteReconnu(idChamp, texteFinal.trim());
      afficherStatutVocal('');
    } else if (texteIntermediaire) {
      afficherStatutVocal(`Je vous écoute... « ${texteIntermediaire.trim()} »`);
    }
  };

  reconnaissanceNouvelle.onend = () => {
    // Écoute terminée normalement : on réinitialise l'état visuel.
    // On ne masque pas un éventuel message d'erreur (onerror se déclenche avant onend).
    reconnaissance = null;
    if (boutonEnEcoute === bouton) {
      bouton.classList.remove('ecoute');
      boutonEnEcoute = null;
    }
    if (!erreurAffichee) {
      afficherStatutVocal('');
    }
  };

  reconnaissanceNouvelle.onerror = (evenement) => {
    const erreurs = {
      'not-allowed': 'Permission micro refusée. Autorisez le micro dans votre navigateur pour utiliser la dictée.',
      'service-not-allowed': 'La reconnaissance vocale est désactivée dans votre navigateur.',
      'no-speech': 'Aucun son détecté. Réessayez en parlant dans le micro.',
      'audio-capture': 'Aucun micro détecté sur cet appareil.',
      'network': 'Pas de connexion internet : la dictée vocale ne fonctionne pas hors ligne. Le formulaire reste utilisable au clavier.',
      'aborted': '',
      'language-not-supported': `La langue « ${langueDictee()} » n'est pas supportée par votre navigateur.`
    };
    const message = erreurs[evenement.error];
    if (message) {
      erreurAffichee = true;
      afficherStatutVocal(message, 'erreur');
    }
    if (boutonEnEcoute === bouton) {
      bouton.classList.remove('ecoute');
      boutonEnEcoute = null;
    }
  };

  try {
    reconnaissanceNouvelle.start();
  } catch (erreur) {
    console.error('Erreur au démarrage de la reconnaissance vocale', erreur);
    afficherStatutVocal('Impossible de démarrer la dictée vocale.', 'erreur');
    arreterEcoute();
  }
}

/**
 * Branche les boutons micro et masque le réglage si l'API n'est pas supportée.
 */
function initialiserTranscriptionVocale() {
  if (!supporterTranscription()) {
    document.querySelectorAll('.btn-micro').forEach((bouton) => {
      bouton.hidden = true;
    });
    const section = document.getElementById('section-dictee-vocale');
    if (section) {
      section.hidden = true;
    }
    return;
  }

  document.getElementById('info-dictee-vocale').hidden = false;

  document.querySelectorAll('.btn-micro').forEach((bouton) => {
    bouton.hidden = false;
    bouton.addEventListener('click', () => demarrerEcoute(bouton));
  });
}

/**
 * Remet l'écran Paramètres en état pour la dictée vocale (langue choisie).
 */
function initialiserVocalParametres() {
  const select = document.getElementById('reglage-langue-dictee');
  if (!select) {
    return;
  }
  select.value = langueDictee();
}

// ---- Branchements ---- //

document.getElementById('reglage-langue-dictee').addEventListener('change', (evenement) => {
  localStorage.setItem(CLE_LANGUE_DICTEE, evenement.target.value);
});

initialiserTranscriptionVocale();
