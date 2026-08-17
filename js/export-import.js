// export-import.js — export et import JSON (fusion par ID, date la plus récente)

/**
 * Exporte toutes les données dans un fichier JSON téléchargeable
 * (structure définie dans 00-CONTEXTE-GLOBAL.md, section 4).
 */
function exporterDonnees() {
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const donnees = {
        version: 1,
        dateExport: new Date().toISOString(),
        mots,
        categories
      };

      const contenu = JSON.stringify(donnees, null, 2);
      const blob = new Blob([contenu], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const lien = document.createElement('a');
      const dateDuJour = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
      lien.href = url;
      lien.download = `vocabulaire_${dateDuJour}.json`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    })
    .catch((erreur) => console.error('Erreur lors de l\'export des données', erreur));
}

/**
 * Compare la dateModification de deux entrées.
 * @returns {number} > 0 si a est plus récente que b
 */
function comparerDates(a, b) {
  const dateA = new Date(a.dateModification || 0).getTime();
  const dateB = new Date(b.dateModification || 0).getTime();
  return dateA - dateB;
}

/**
 * Fusionne les données importées avec les données locales.
 * Règle : comparaison par id ; en cas de conflit, la version la plus récente
 * (dateModification) est conservée. Les catégories sont importées avant les mots.
 * @param {{mots: Array, categories: Array}} donnees - Données du fichier importé
 * @returns {Promise<{motsAjoutes: number, motsMisAJour: number, categoriesAjoutees: number, categoriesMisesAJour: number}>}
 */
function fusionnerImport(donnees) {
  const resume = { motsAjoutes: 0, motsMisAJour: 0, categoriesAjoutees: 0, categoriesMisesAJour: 0 };

  // Normalise les enregistrements importés : l'id utilisateur du fichier n'est
  // jamais importé tel quel (il est réattribué à l'utilisateur qui importe, ou
  // laissé nul en mode invité) et les données importées repassent en attente de
  // synchronisation pour être poussées lors de la prochaine sync.
  const userId = (typeof obtenirUtilisateurCourantId === 'function')
    ? obtenirUtilisateurCourantId()
    : null;
  const normaliser = (enregistrement) => ({
    ...enregistrement,
    userId,
    syncStatus: 'en_attente',
    supprime: false
  });
  donnees = {
    mots: (donnees.mots || []).map(normaliser),
    categories: (donnees.categories || []).map(normaliser)
  };

  return obtenirToutesLesCategories().then((categoriesLocales) => {
    const parIdCategories = new Map(categoriesLocales.map((c) => [c.id, c]));

    // 1. Catégories d'abord (pour éviter des références à des catégories absentes)
    const operationsCategories = [];
    (donnees.categories || []).forEach((importee) => {
      const locale = parIdCategories.get(importee.id);
      if (!locale) {
        operationsCategories.push(ajouterCategorie(importee));
        resume.categoriesAjoutees++;
      } else if (comparerDates(importee, locale) > 0) {
        operationsCategories.push(modifierCategorie(importee));
        resume.categoriesMisesAJour++;
      }
    });

    return Promise.all(operationsCategories).then(() => obtenirTousLesMots());
  }).then((motsLocaux) => {
    const parIdMots = new Map(motsLocaux.map((m) => [m.id, m]));

    // 2. Mots ensuite
    const operationsMots = [];
    (donnees.mots || []).forEach((importe) => {
      const local = parIdMots.get(importe.id);
      if (!local) {
        operationsMots.push(ajouterMot(importe));
        resume.motsAjoutes++;
      } else if (comparerDates(importe, local) > 0) {
        operationsMots.push(modifierMot(importe));
        resume.motsMisAJour++;
      }
    });

    return Promise.all(operationsMots).then(() => resume);
  });
}

/**
 * Importe le contenu d'un fichier JSON sélectionné par l'utilisateur.
 * @param {File} fichier - Le fichier à importer
 */
function importerDonnees(fichier) {
  const lecteur = new FileReader();

  lecteur.onload = () => {
    let donnees;
    try {
      donnees = JSON.parse(lecteur.result);
    } catch (erreur) {
      alert('Fichier invalide : ce n\'est pas un JSON valide.');
      return;
    }

    if (!donnees || !Array.isArray(donnees.mots) || !Array.isArray(donnees.categories)) {
      alert('Fichier invalide : la structure attendue (clés « mots » et « categories ») est absente.');
      return;
    }

    fusionnerImport(donnees)
      .then((resume) => {
        alert(`Import terminé : ${resume.motsAjoutes} mot(s) ajouté(s), ` +
          `${resume.motsMisAJour} mot(s) mis à jour, ` +
          `${resume.categoriesAjoutees} catégorie(s) ajoutée(s), ` +
          `${resume.categoriesMisesAJour} catégorie(s) mise(s) à jour.`);
        afficherListeMots();
      })
      .catch((erreur) => {
        console.error('Erreur lors de l\'import des données', erreur);
        alert('Erreur pendant l\'import : les données n\'ont pas été modifiées.');
      });
  };

  lecteur.onerror = () => {
    alert('Erreur de lecture du fichier.');
  };

  lecteur.readAsText(fichier);
}

// Branchement des boutons de l'écran Paramètres
document.getElementById('btn-exporter').addEventListener('click', exporterDonnees);

document.getElementById('btn-importer').addEventListener('click', () => {
  document.getElementById('champ-fichier-import').click();
});

document.getElementById('champ-fichier-import').addEventListener('change', (evenement) => {
  const fichier = evenement.target.files[0];
  if (!fichier) {
    return;
  }

  // Confirmation si des données locales existent déjà (évite une fusion accidentelle)
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      const aDesDonnees = mots.length > 0 || categories.some((c) => !c.estParDefaut);

      if (aDesDonnees && !confirm('Des données locales existent déjà. L\'import va fusionner avec elles. Continuer ?')) {
        evenement.target.value = '';
        return;
      }

      importerDonnees(fichier);
      evenement.target.value = '';
    })
    .catch((erreur) => console.error('Erreur lors de la vérification des données locales', erreur));
});
