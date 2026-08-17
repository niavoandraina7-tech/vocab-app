// rappels.js — rappels de révision (bandeau visuel à l'ouverture + notification navigateur)
//
// Deux mécanismes complémentaires :
// 1. Bandeau visuel dans l'écran Liste — fiable, fonctionne hors ligne, sans permission.
// 2. Notification navigateur — best-effort : ne se déclenche que lorsque l'app est
//    ouverte (ou en arrière-plan récent), jamais de façon garantie app fermée,
//    car l'application fonctionne sans backend.

// Réglages persistés en localStorage (l'app n'a pas encore de store de paramètres)
const CLE_RAPPELS_ACTIVES = 'rappelsActives';
const CLE_SEUIL_RAPPEL_JOURS = 'seuilRappelJours';
const SEUIL_RAPPEL_DEFAUT = 2;

/**
 * Les rappels sont-ils activés par l'utilisateur ?
 * @returns {boolean}
 */
function rappelsActives() {
  return localStorage.getItem(CLE_RAPPELS_ACTIVES) === 'true';
}

/**
 * Nombre de jours au-delà duquel un mot en attente déclenche une notification.
 * @returns {number}
 */
function seuilRappelJours() {
  const valeur = parseInt(localStorage.getItem(CLE_SEUIL_RAPPEL_JOURS), 10);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : SEUIL_RAPPEL_DEFAUT;
}

/**
 * Met à jour le bandeau « X mots à réviser aujourd'hui » de l'écran Liste.
 * Le bandeau est masqué dès qu'aucun mot n'est en attente.
 */
function mettreAJourBandeauRappel() {
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const motsAReviser = selectionnerMotsAReviser(mots, '', categories);
      const bandeau = document.getElementById('bandeau-rappels');
      if (!bandeau) {
        return;
      }
      if (motsAReviser.length === 0) {
        bandeau.hidden = true;
        return;
      }
      document.getElementById('bandeau-rappels-texte').textContent =
        `📌 ${motsAReviser.length} mot(s) à réviser aujourd'hui`;
      bandeau.hidden = false;
    })
    .catch((erreur) => console.error('Erreur lors de la mise à jour du bandeau de rappel', erreur));
}

/**
 * Mots à réviser qui attendent depuis plus de `jours` jours
 * (depuis la dernière révision, ou la création si jamais révisé).
 * @param {Array<Object>} mots
 * @param {Array<Object>} categories
 * @param {number} jours - Seuil en jours
 * @returns {Array<Object>}
 */
function motsEnAttenteDepuisJours(mots, categories, jours) {
  return selectionnerMotsAReviser(mots, '', categories).filter((mot) => {
    // La date de référence est la prochaine révision programmée si elle existe,
    // sinon la dernière révision (ou la création pour un mot jamais révisé).
    const historique = mot.historiqueRevision || [];
    const dateReference = mot.prochaineRevision
      ? parserDateRevision(mot.prochaineRevision)
      : (historique.length > 0
          ? new Date(historique[historique.length - 1].date)
          : new Date(mot.dateCreation));
    const diffJours = (Date.now() - dateReference.getTime()) / (1000 * 60 * 60 * 24);
    return diffJours >= jours;
  });
}

/**
 * Vérifie, à chaque ouverture de l'app, si une notification navigateur doit être envoyée.
 * Best-effort : ne fait rien si les rappels sont désactivés, si la permission
 * n'est pas accordée ou si le navigateur ne supporte pas Notification.
 */
function verifierRappelNotification() {
  if (!rappelsActives() || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const jours = seuilRappelJours();
      const enAttente = motsEnAttenteDepuisJours(mots, categories, jours);
      if (enAttente.length === 0) {
        return;
      }

      const notification = new Notification('Mon Vocabulaire', {
        body: `${enAttente.length} mot(s) attendent une révision depuis plus de ${jours} jour(s).`,
        icon: 'icons/icon-192.png'
      });
      // Clic sur la notification → ouvre l'app sur l'onglet Révision
      notification.onclick = () => {
        window.focus();
        afficherEcran('revision');
        notification.close();
      };
    })
    .catch((erreur) => console.error('Erreur lors de la vérification des rappels', erreur));
}

/**
 * (Re)met en état l'écran Paramètres (toggle + seuil + message d'information).
 * Appelé à chaque affichage de l'écran Paramètres.
 */
function initialiserRappelsParametres() {
  const caseRappels = document.getElementById('reglage-rappels-actives');
  const selectSeuil = document.getElementById('reglage-seuil-rappels');
  const info = document.getElementById('info-permission-rappels');
  if (!caseRappels) {
    return;
  }

  caseRappels.checked = rappelsActives();
  selectSeuil.value = String(seuilRappelJours());

  if (!('Notification' in window)) {
    caseRappels.disabled = true;
    info.textContent = 'Votre navigateur ne prend pas en charge les notifications. Les rappels visuels dans l\'app restent actifs.';
    return;
  }

  if (rappelsActives()) {
    if (Notification.permission === 'granted') {
      info.textContent = 'Notifications activées : une notification s\'affiche à l\'ouverture de l\'app quand des mots sont en retard.';
    } else if (Notification.permission === 'denied') {
      info.textContent = 'Permission refusée dans votre navigateur : les rappels visuels dans l\'app restent actifs, mais aucune notification navigateur ne sera envoyée.';
    }
  }
}

// ---- Branchements ---- //

// Clic sur le bandeau → ouverture directe de l'onglet Révision
document.getElementById('bandeau-rappels').addEventListener('click', () => afficherEcran('revision'));

// Toggle « Activer les rappels » : demande la permission navigateur à l'activation
document.getElementById('reglage-rappels-actives').addEventListener('change', (evenement) => {
  const caseRappels = evenement.target;
  const info = document.getElementById('info-permission-rappels');

  if (!caseRappels.checked) {
    localStorage.removeItem(CLE_RAPPELS_ACTIVES);
    info.textContent = '';
    return;
  }

  // Le clic sur le toggle est un geste utilisateur : on peut demander la permission ici
  Notification.requestPermission().then((permission) => {
    // Dans les deux cas, les rappels restent « activés » : le bandeau visuel,
    // lui, fonctionne sans permission. Seule la notification dépend de la permission.
    localStorage.setItem(CLE_RAPPELS_ACTIVES, 'true');

    if (permission === 'granted') {
      info.textContent = 'Notifications activées : une notification s\'affiche à l\'ouverture de l\'app quand des mots sont en retard.';
      verifierRappelNotification();
    } else {
      info.textContent = 'Permission non accordée : les rappels visuels dans l\'app restent actifs, mais aucune notification navigateur ne sera envoyée.';
    }
  });
});

// Seuil configurable : nombre de jours d'attente avant notification
document.getElementById('reglage-seuil-rappels').addEventListener('change', (evenement) => {
  localStorage.setItem(CLE_SEUIL_RAPPEL_JOURS, evenement.target.value);
});
