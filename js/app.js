// app.js — logique principale de l'application (initialisation, navigation, rendu)

/**
 * Affiche l'écran demandé et masque les autres.
 * @param {string} nomEcran - Identifiant de l'écran (liste, ajout, categories, revision, parametres)
 */
function afficherEcran(nomEcran) {
  // Quitter l'écran de révision arrête une éventuelle session de quiz
  if (nomEcran !== 'revision') {
    arreterQuiz();
  }

  // Masque tous les écrans, puis affiche celui demandé
  document.querySelectorAll('.ecran').forEach((section) => {
    section.classList.toggle('active', section.id === `ecran-${nomEcran}`);
  });

  // Met à jour le bouton actif de la barre de navigation
  document.querySelectorAll('.nav-bouton').forEach((bouton) => {
    bouton.classList.toggle('active', bouton.dataset.ecran === nomEcran);
  });

  // Recharge la liste des mots à chaque affichage de l'écran Liste
  if (nomEcran === 'liste') {
    afficherListeMots();
    mettreAJourBandeauRappel();
  }

  // Recharge l'arbre des catégories à chaque affichage de l'écran Catégories
  if (nomEcran === 'categories') {
    afficherCategories();
  }

  // Affiche l'écran de révision (accueil, session ou fin de session)
  if (nomEcran === 'revision') {
    afficherEcranRevision();
  }

  // Remet l'écran Paramètres en état (rappels, langue de dictée, messages)
  if (nomEcran === 'parametres') {
    initialiserRappelsParametres();
    initialiserVocalParametres();
  }
}

// Navigation : clic sur un bouton de la barre
document.querySelectorAll('.nav-bouton').forEach((bouton) => {
  bouton.addEventListener('click', () => {
    // Le bouton « Ajouter » repart toujours d'un formulaire vierge
    if (bouton.dataset.ecran === 'ajout') {
      reinitialiserFormulaireMot();
    }
    afficherEcran(bouton.dataset.ecran);
  });
});

// Accès à la gestion des catégories depuis l'écran Liste
document.getElementById('btn-gestion-categories').addEventListener('click', () => afficherEcran('categories'));

// Retour à la liste depuis l'écran Catégories
document.getElementById('btn-retour-liste').addEventListener('click', () => afficherEcran('liste'));

// Enregistrement du Service Worker (PWA / hors ligne), si supporté par le navigateur
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => {})
      .catch((erreur) => {
        console.error('Erreur lors de l\'enregistrement du Service Worker', erreur);
      });
  });
}

// Initialisation au premier chargement : ouverture de la base, catégories par défaut, liste
obtenirBase()
  .then(initialiserCategoriesParDefaut)
  .then(() => {
    afficherListeMots();
    // À chaque ouverture de l'app : bandeau de rappel + notification éventuelle
    mettreAJourBandeauRappel();
    verifierRappelNotification();
  })
  .catch((erreur) => {
    console.error('Erreur lors de l\'initialisation de l\'application', erreur);
  });
