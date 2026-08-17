// mots.js — gestion des mots (ajout, édition, suppression, consultation)

// Identifiant du mot en cours d'édition (null = mode ajout)
let motEnEditionId = null;

/**
 * (Re)remplit une liste déroulante de filtre catégorie avec l'arbre complet.
 * @param {HTMLSelectElement} select - L'élément <select> à remplir
 * @param {Array<Object>} categories - Liste plate des catégories
 */
function remplirOptionsFiltreCategorie(select, categories) {
  const valeurActuelle = select.value;

  select.innerHTML = '<option value="">Toutes les catégories</option>';

  const arbre = construireArbreCategories(categories);
  arbre.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));

  const ajouterOptions = (noeuds, profondeur) => {
    noeuds.forEach((noeud) => {
      const option = document.createElement('option');
      option.value = noeud.categorie.id;
      option.textContent = (profondeur > 0 ? '— '.repeat(profondeur) : '') + noeud.categorie.nom;
      select.appendChild(option);

      noeud.sousCategories.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));
      ajouterOptions(noeud.sousCategories, profondeur + 1);
    });
  };

  ajouterOptions(arbre, 0);

  // Restaure la sélection si la catégorie existe toujours
  if (valeurActuelle && categories.some((c) => c.id === valeurActuelle)) {
    select.value = valeurActuelle;
  }
}

/**
 * Applique la recherche texte et le filtre catégorie sur la liste des mots.
 * @param {Array<Object>} mots
 * @param {Array<Object>} categories
 * @returns {Array<Object>}
 */
function filtrerMots(mots, categories) {
  const texte = document.getElementById('champ-recherche').value.trim().toLowerCase();
  const idCategorie = document.getElementById('filtre-categorie').value;

  // Ids de la catégorie choisie + toutes ses sous-catégories
  let idsCategorie = null;
  if (idCategorie) {
    idsCategorie = obtenirIdsCategorieEtSousCategories(idCategorie, categories);
  }

  return mots.filter((mot) => {
    // Recherche texte : insensible à la casse, partielle, sur mot + définition
    const correspondTexte = !texte
      || mot.mot.toLowerCase().includes(texte)
      || (mot.definition || '').toLowerCase().includes(texte);

    // Filtre catégorie : le mot est dans la catégorie choisie ou l'une de ses sous-catégories
    const correspondCategorie = !idsCategorie
      || (mot.categorieIds || []).some((id) => idsCategorie.has(id));

    return correspondTexte && correspondCategorie;
  });
}

/**
 * Charge et affiche les mots dans l'écran Liste en appliquant recherche + filtre.
 */
function afficherListeMots() {
  Promise.all([obtenirTousLesMots(), obtenirToutesLesCategories()])
    .then(([mots, categories]) => {
      remplirOptionsFiltreCategorie(document.getElementById('filtre-categorie'), categories);

      // Si la catégorie filtrée a été supprimée entre-temps, revient à « Toutes »
      const selectFiltre = document.getElementById('filtre-categorie');
      if (selectFiltre.value && !categories.some((c) => c.id === selectFiltre.value)) {
        selectFiltre.value = '';
      }

      const ul = document.getElementById('liste-mots');
      ul.innerHTML = '';

      if (mots.length === 0) {
        const li = document.createElement('li');
        li.className = 'liste-vide';
        li.textContent = 'Aucun mot pour le moment. Ajoutez votre premier mot !';
        ul.appendChild(li);
        return;
      }

      const motsFiltres = filtrerMots(mots, categories);

      if (motsFiltres.length === 0) {
        const li = document.createElement('li');
        li.className = 'liste-vide';
        li.textContent = 'Aucun mot trouvé.';
        ul.appendChild(li);
        return;
      }

      const nomsCategories = new Map(categories.map((c) => [c.id, c.nom]));

      // Tri : mots les plus récemment créés en premier
      motsFiltres.sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

      motsFiltres.forEach((mot) => {
        const li = document.createElement('li');
        li.className = 'entree-mot';

        const titre = document.createElement('div');
        titre.className = 'mot-titre';
        titre.textContent = mot.mot;

        const badge = document.createElement('span');
        badge.className = `badge badge-${mot.niveauMaitrise || 'nouveau'}`;
        badge.textContent = libelleNiveau(mot.niveauMaitrise || 'nouveau');

        const detail = document.createElement('div');
        detail.className = 'mot-detail';
        detail.textContent = mot.definition || '';

        li.append(titre, badge, detail);

        const nomsCategorie = (mot.categorieIds || [])
          .map((id) => nomsCategories.get(id))
          .filter(Boolean)
          .join(', ');

        if (nomsCategorie) {
          const categoriesEl = document.createElement('div');
          categoriesEl.className = 'mot-categories';
          categoriesEl.textContent = nomsCategorie;
          li.append(categoriesEl);
        }

        li.addEventListener('click', () => ouvrirEditionMot(mot.id));
        ul.appendChild(li);
      });
    })
    .catch((erreur) => console.error('Erreur lors du chargement des mots', erreur));
}

/**
 * Active la recherche en temps réel et le filtre par catégorie.
 */
function initialiserRechercheFiltre() {
  document.getElementById('champ-recherche').addEventListener('input', () => afficherListeMots());
  document.getElementById('filtre-categorie').addEventListener('change', () => afficherListeMots());
}

initialiserRechercheFiltre();

/**
 * Remplit la liste de cases à cocher des catégories, en pré-cochant idsSelectionnes.
 * @param {string[]} idsSelectionnes - ids des catégories à pré-cocher
 */
function remplirSelectionCategories(idsSelectionnes = []) {
  obtenirToutesLesCategories().then((categories) => {
    const conteneur = document.getElementById('selection-categories');
    conteneur.innerHTML = '';

    if (categories.length === 0) {
      conteneur.textContent = 'Aucune catégorie disponible.';
      return;
    }

    // Sélecteur sous forme d'arbre : les sous-catégories sont indentées
    const arbre = construireArbreCategories(categories);
    arbre.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));

    const creerOptions = (noeuds, profondeur) => {
      noeuds.forEach((noeud) => {
        const categorie = noeud.categorie;

        const label = document.createElement('label');
        label.className = 'categorie-option';
        label.style.paddingLeft = `${12 + profondeur * 20}px`;

        const caseCoche = document.createElement('input');
        caseCoche.type = 'checkbox';
        caseCoche.value = categorie.id;
        caseCoche.checked = idsSelectionnes.includes(categorie.id);

        label.append(caseCoche, document.createTextNode(' ' + categorie.nom));
        conteneur.appendChild(label);

        noeud.sousCategories.sort((a, b) => a.categorie.nom.localeCompare(b.categorie.nom, 'fr'));
        creerOptions(noeud.sousCategories, profondeur + 1);
      });
    };

    creerOptions(arbre, 0);
  }).catch((erreur) => console.error('Erreur lors du chargement des catégories', erreur));
}

/**
 * Récupère les ids des catégories cochées dans le formulaire.
 * @returns {string[]}
 */
function recupererIdsCategoriesSelectionnees() {
  return Array.from(
    document.querySelectorAll('#selection-categories input[type="checkbox"]:checked')
  ).map((caseCoche) => caseCoche.value);
}

/**
 * Remet le formulaire en mode ajout (vierge, sans bouton suppression).
 */
function reinitialiserFormulaireMot() {
  motEnEditionId = null;
  document.getElementById('titre-ajout').textContent = 'Ajouter un mot';
  document.getElementById('form-mot').reset();
  document.getElementById('btn-supprimer-mot').hidden = true;
  remplirSelectionCategories([]);
}

/**
 * Ouvre l'écran d'édition avec les données du mot pré-remplies.
 * @param {string} id - Identifiant du mot à éditer
 */
function ouvrirEditionMot(id) {
  obtenirTousLesMots().then((mots) => {
    const mot = mots.find((m) => m.id === id);
    if (!mot) {
      console.error('Mot introuvable :', id);
      return;
    }

    motEnEditionId = mot.id;
    document.getElementById('titre-ajout').textContent = 'Modifier le mot';
    document.getElementById('champ-mot').value = mot.mot;
    document.getElementById('champ-definition').value = mot.definition || '';
    document.getElementById('champ-exemple').value = mot.exemple || '';
    document.getElementById('champ-langue').value = mot.langue || '';
    // Pré-sélectionne un délai 1..7 si la prochaineRevision est proche, sinon Automatique
    document.getElementById('champ-prochaine-revision').value = valeurPourSelectDelai(mot.prochaineRevision);
    document.getElementById('btn-supprimer-mot').hidden = false;
    remplirSelectionCategories(mot.categorieIds || []);

    afficherEcran('ajout');
  }).catch((erreur) => console.error('Erreur lors du chargement du mot', erreur));
}

/**
 * Branche les événements du formulaire (soumission, suppression).
 */
function initialiserFormulaireMot() {
  // Soumission : ajout ou édition
  document.getElementById('form-mot').addEventListener('submit', (evenement) => {
    evenement.preventDefault();

    const champMot = document.getElementById('champ-mot');
    const mot = champMot.value.trim();

    // Validation : le champ Mot est obligatoire
    if (!mot) {
      champMot.focus();
      return;
    }

    const maintenant = new Date().toISOString();
    const categorieIds = recupererIdsCategoriesSelectionnees();
    const definition = document.getElementById('champ-definition').value.trim();
    const exemple = document.getElementById('champ-exemple').value.trim();
    const langue = document.getElementById('champ-langue').value.trim();
    // Délai choisi par l'utilisateur ('' = automatique), convertir en date AAAA-MM-JJ
    const delaiSelectionne = document.getElementById('champ-prochaine-revision').value;
    const prochaineRevision = delaiSelectionne
      ? dateEnLocalAAJJMMJJ(new Date(Date.now() + parseInt(delaiSelectionne, 10) * 24 * 60 * 60 * 1000))
      : null;

    if (motEnEditionId) {
      // Édition : on conserve dateCreation et historiqueRevision de l'existant
      obtenirTousLesMots().then((mots) => {
        const existant = mots.find((m) => m.id === motEnEditionId);
        if (!existant) {
          return;
        }
        return modifierMot({
          ...existant,
          mot,
          definition,
          exemple,
          langue,
          categorieIds,
          prochaineRevision,
          dateModification: maintenant
        });
      }).then(() => afficherEcran('liste'))
        .catch((erreur) => console.error('Erreur lors de la modification du mot', erreur));
    } else {
      // Ajout
      ajouterMot({
        id: genererUUID(),
        mot,
        definition,
        exemple,
        langue,
        categorieIds,
        prochaineRevision,
        dateCreation: maintenant,
        dateModification: maintenant,
        niveauMaitrise: 'nouveau',
        historiqueRevision: []
      }).then(() => {
        document.getElementById('form-mot').reset();
        afficherEcran('liste');
      }).catch((erreur) => console.error('Erreur lors de l\'ajout du mot', erreur));
    }
  });

  // Suppression avec confirmation
  document.getElementById('btn-supprimer-mot').addEventListener('click', () => {
    if (!motEnEditionId) {
      return;
    }
    if (!confirm('Supprimer ce mot définitivement ?')) {
      return;
    }
    supprimerMot(motEnEditionId)
      .then(() => {
        reinitialiserFormulaireMot();
        afficherEcran('liste');
      })
      .catch((erreur) => console.error('Erreur lors de la suppression du mot', erreur));
  });
}

initialiserFormulaireMot();
