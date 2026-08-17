// statistiques.js — statistiques de révision (écran Paramètres → Statistiques)
//
// Données dérivées des mots locaux (niveau de maîtrise + historiqueRevision) :
// aucune écriture, aucun champ supplémentaire.

/**
 * Série de jours consécutifs avec au moins une révision, se terminant
 * aujourd'hui (ou hier si rien aujourd'hui — la série n'est pas encore cassée).
 * @param {string[]} datesISO - Toutes les dates de révision (ISO)
 * @returns {number}
 */
function calculerSerieJours(datesISO) {
  if (datesISO.length === 0) {
    return 0;
  }
  const jours = new Set(datesISO.map((date) => dateEnLocalAAJJMMJJ(new Date(date))));
  const jour = new Date();

  if (!jours.has(dateEnLocalAAJJMMJJ(jour))) {
    jour.setDate(jour.getDate() - 1);
    if (!jours.has(dateEnLocalAAJJMMJJ(jour))) {
      return 0;
    }
  }

  let serie = 0;
  while (jours.has(dateEnLocalAAJJMMJJ(jour))) {
    serie++;
    jour.setDate(jour.getDate() - 1);
  }
  return serie;
}

/**
 * (Re)rend l'écran Statistiques dans #zone-statistiques.
 * Appelé à chaque affichage de l'écran Paramètres → Statistiques.
 */
function afficherStatistiques() {
  obtenirTousLesMots()
    .then((mots) => {
      const zone = document.getElementById('zone-statistiques');
      if (!zone) {
        return;
      }
      zone.innerHTML = '';

      const total = mots.length;
      const parNiveau = { nouveau: 0, en_cours: 0, acquis: 0 };
      const datesRevisions = [];
      let revisionsTotales = 0;
      let revisionsAujourdhui = 0;
      const cleAujourdhui = dateEnLocalAAJJMMJJ(new Date());

      mots.forEach((mot) => {
        const niveau = mot.niveauMaitrise || 'nouveau';
        parNiveau[niveau] = (parNiveau[niveau] || 0) + 1;
        (mot.historiqueRevision || []).forEach((entree) => {
          revisionsTotales++;
          datesRevisions.push(entree.date);
          if (dateEnLocalAAJJMMJJ(new Date(entree.date)) === cleAujourdhui) {
            revisionsAujourdhui++;
          }
        });
      });

      const serie = calculerSerieJours(datesRevisions);
      const pctAcquis = total > 0 ? Math.round((parNiveau.acquis / total) * 100) : 0;
      const programme = mots.filter((mot) => mot.prochaineRevision).length;

      const construireCarte = (icone, valeur, titre, sousTitre) => {
        const carte = document.createElement('div');
        carte.className = 'carte-statistique';
        const v = document.createElement('div');
        v.className = 'carte-statistique-valeur';
        v.textContent = `${icone} ${valeur}`;
        const t = document.createElement('div');
        t.className = 'carte-statistique-titre';
        t.textContent = titre;
        if (sousTitre) {
          const s = document.createElement('div');
          s.className = 'carte-statistique-sous-titre';
          s.textContent = sousTitre;
          carte.append(v, t, s);
        } else {
          carte.append(v, t);
        }
        return carte;
      };

      const grille = document.createElement('div');
      grille.className = 'grille-statistiques';

      grille.append(
        construireCarte('📚', String(total), 'Mots au total', total === 0 ? 'Ajoutez vos premiers mots !' : 'Dans votre vocabulaire'),
        construireCarte('🎯', `${parNiveau.acquis} (${pctAcquis} %)`, 'Mots maîtrisés', 'Niveau « acquis »'),
        construireCarte('🔥', String(serie), 'Série de révisions', serie <= 1 ? 'Réviser chaque jour la maintient !' : 'Jours consécutifs'),
        construireCarte('🔁', String(revisionsTotales), 'Révisions effectuées', `dont ${revisionsAujourdhui} aujourd'hui`),
        construireCarte('🗓️', String(programme), 'Mots programmés', 'Prochaine révision planifiée')
      );
      zone.appendChild(grille);

      // Répartition par niveau
      const repartition = document.createElement('div');
      repartition.className = 'repartition-statistiques';
      const titreRepartition = document.createElement('h3');
      titreRepartition.textContent = 'Répartition par niveau';
      repartition.appendChild(titreRepartition);

      Object.keys(parNiveau).forEach((niveau) => {
        const ligne = document.createElement('div');
        ligne.className = 'ligne-repartition';

        const badge = document.createElement('span');
        badge.className = `badge badge-${niveau}`;
        badge.textContent = libelleNiveau(niveau);

        const barre = document.createElement('div');
        barre.className = 'barre-repartition';
        const remplissage = document.createElement('div');
        remplissage.className = `remplissage-repartition remplissage-${niveau}`;
        remplissage.style.width = `${total > 0 ? Math.round((parNiveau[niveau] / total) * 100) : 0}%`;
        barre.appendChild(remplissage);

        const compte = document.createElement('span');
        compte.className = 'compte-repartition';
        compte.textContent = String(parNiveau[niveau]);

        ligne.append(badge, barre, compte);
        repartition.appendChild(ligne);
      });

      zone.appendChild(repartition);

      if (total === 0) {
        const conseil = document.createElement('p');
        conseil.className = 'conseil';
        conseil.textContent = 'Les statistiques apparaîtront dès que vous aurez ajouté et révisé vos premiers mots.';
        zone.appendChild(conseil);
      }
    })
    .catch((erreur) => console.error('Erreur lors du chargement des statistiques', erreur));
}
