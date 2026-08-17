// app.js — logique principale de l'application (initialisation, navigation, rendu)

/**
 * Affiche l'écran demandé et masque les autres.
 * @param {string} nomEcran - Identifiant de l'écran (liste, detail, ajout, categories, revision, parametres)
 */
function afficherEcran(nomEcran) {
  // Quitter l'écran de révision arrête une éventuelle session de quiz
  if (nomEcran !== 'revision') {
    arreterQuiz();
  }

  // L'écran d'authentification est un écran dédié : on masque la barre de
  // navigation (classe .sans-navigation sur <body>) pour garder le focus
  // sur la connexion/inscription.
  document.body.classList.toggle('sans-navigation', nomEcran === 'connexion');

  // En entrant sur l'écran de connexion (bouton menu masqué), on ferme le menu
  if (nomEcran === 'connexion') {
    fermerMenu();
  }

  // Masque tous les écrans, puis affiche celui demandé
  document.querySelectorAll('.ecran').forEach((section) => {
    section.classList.toggle('active', section.id === `ecran-${nomEcran}`);
  });

  // Met à jour le bouton actif du menu de navigation
  // (la fiche détail fait partie de l'onglet Liste ; les sous-écrans de
  // Paramètres font partie de l'onglet Paramètres)
  const SOUS_ECRANS_PARAMETRES = ['parametres-compte', 'parametres-rappels', 'parametres-dictee', 'parametres-export', 'parametres-statistiques'];
  const nomEcranNav = nomEcran === 'detail' ? 'liste'
    : SOUS_ECRANS_PARAMETRES.includes(nomEcran) ? 'parametres' : nomEcran;
  document.querySelectorAll('.nav-bouton').forEach((bouton) => {
    bouton.classList.toggle('active', bouton.dataset.ecran === nomEcranNav);
  });

  // Recharge la liste des mots à chaque affichage de l'écran Liste
  if (nomEcran === 'liste') {
    afficherListeMots();
    mettreAJourBandeauRappel();
    // Indicateur de synchronisation (état + modifications en attente)
    if (typeof mettreAJourIndicateurSync === 'function') {
      mettreAJourIndicateurSync();
    }
  }

  // Recharge l'arbre des catégories à chaque affichage de l'écran Catégories
  if (nomEcran === 'categories') {
    afficherCategories();
  }

  // Affiche l'écran de révision (accueil, session ou fin de session)
  if (nomEcran === 'revision') {
    afficherEcranRevision();
  }

  // Sous-écrans Paramètres : chaque section se met en état à l'ouverture
  // (compte, rappels, langue de dictée, messages)
  if (nomEcran === 'parametres-compte' && typeof afficherZoneCompte === 'function') {
    afficherZoneCompte();
  }
  if (nomEcran === 'parametres-rappels') {
    initialiserRappelsParametres();
  }
  if (nomEcran === 'parametres-dictee') {
    initialiserVocalParametres();
  }
  if (nomEcran === 'parametres-statistiques' && typeof afficherStatistiques === 'function') {
    afficherStatistiques();
  }
}

// Paramètres : clic sur une section de l'index -> ouvre le sous-écran
// (ex. data-section-parametres="compte" -> afficherEcran('parametres-compte'))
document.querySelectorAll('[data-section-parametres]').forEach((bouton) => {
  bouton.addEventListener('click', () => {
    afficherEcran(`parametres-${bouton.dataset.sectionParametres}`);
  });
});

// Paramètres : bouton « ← Paramètres » des sous-écrans -> retour à l'index
document.querySelectorAll('[data-retour-parametres]').forEach((bouton) => {
  bouton.addEventListener('click', () => afficherEcran('parametres'));
});

// ---- Menu de navigation (bouton hamburger ☰) ----

/**
 * Ouvre le menu de navigation (tiroir latéral) + le voile assombri.
 */
function ouvrirMenu() {
  const menu = document.getElementById('barre-navigation');
  const voile = document.getElementById('voile-menu');
  const bouton = document.getElementById('btn-menu');
  menu.classList.add('ouvert');
  menu.setAttribute('aria-hidden', 'false');
  voile.hidden = false;
  bouton.setAttribute('aria-expanded', 'true');
  bouton.setAttribute('aria-label', 'Fermer le menu de navigation');
}

/**
 * Ferme le menu de navigation (tiroir latéral) + le voile assombri.
 */
function fermerMenu() {
  const menu = document.getElementById('barre-navigation');
  const voile = document.getElementById('voile-menu');
  const bouton = document.getElementById('btn-menu');
  if (!menu) {
    return;
  }
  menu.classList.remove('ouvert');
  menu.setAttribute('aria-hidden', 'true');
  voile.hidden = true;
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-label', 'Ouvrir le menu de navigation');
}

/**
 * Bascule l'état ouvert/fermé du menu.
 */
function basculerMenu() {
  const menu = document.getElementById('barre-navigation');
  if (menu.classList.contains('ouvert')) {
    fermerMenu();
  } else {
    ouvrirMenu();
  }
}

// Branchements du menu
if (document.getElementById('btn-menu')) {
  document.getElementById('btn-menu').addEventListener('click', basculerMenu);
  document.getElementById('voile-menu').addEventListener('click', fermerMenu);
  document.getElementById('btn-fermer-menu').addEventListener('click', fermerMenu);

  // Échap ferme le menu
  document.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Escape') {
      fermerMenu();
    }
  });
}

// Navigation : clic sur un bouton du menu
// (le tiroir se referme automatiquement après la navigation)
document.querySelectorAll('.nav-bouton').forEach((bouton) => {
  bouton.addEventListener('click', () => {
    // Le bouton « Ajouter » repart toujours d'un formulaire vierge
    if (bouton.dataset.ecran === 'ajout') {
      reinitialiserFormulaireMot();
    }
    afficherEcran(bouton.dataset.ecran);
    fermerMenu();
  });
});

// À l'ouverture du site : si Supabase est configuré et qu'aucune session n'est
// encore restaurée, la page de connexion s'affiche en premier. L'utilisateur
// peut s'y connecter, s'inscrire, ou continuer sans compte (mode invité).
// Si une session existe, la restauration (INITIAL_SESSION dans auth.js) envoie
// directement vers l'écran Liste.
if (typeof configSupabaseValide === 'function'
    && configSupabaseValide()
    && typeof obtenirUtilisateurCourant === 'function'
    && !obtenirUtilisateurCourant()) {
  afficherEcran('connexion');
}

// Enregistrement du Service Worker (PWA / hors ligne), si supporté par le navigateur
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => {})
      .catch((erreur) => {
        console.error('Erreur lors de l\'enregistrement du Service Worker', erreur);
      });
  });

  // Clic sur une notification push → ouvre l'onglet Jeu (révision)
  navigator.serviceWorker.addEventListener('message', (evenement) => {
    if (evenement.data && evenement.data.type === 'ouvrir-revision') {
      afficherEcran('revision');
    }
  });
}

// Initialisation au premier chargement : ouverture de la base, catégories par défaut,
// authentification (restauration de session) et synchronisation, puis affichage.
obtenirBase()
  .then(initialiserCategoriesParDefaut)
  .then(() => {
    if (typeof initialiserAuth === 'function') {
      initialiserAuth();
    }
    if (typeof initialiserSync === 'function') {
      initialiserSync();
    }
    afficherListeMots();
    // À chaque ouverture de l'app : bandeau de rappel + notification éventuelle
    mettreAJourBandeauRappel();
    verifierRappelNotification();
  })
  .catch((erreur) => {
    console.error('Erreur lors de l\'initialisation de l\'application', erreur);
  });
