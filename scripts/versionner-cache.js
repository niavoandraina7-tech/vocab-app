// scripts/versionner-cache.js — remplace l'incrémentation manuelle de NOM_CACHE
//
// L'app est 100 % statique (aucun build) : le navigateur ne réinstalle le
// service worker que si son fichier change. Pour que les utilisateurs reçoivent
// automatiquement les nouvelles versions, on calcule un hash SHA-256 du contenu
// des fichiers mis en cache et on l'injecte dans NOM_CACHE (service-worker.js).
// Toute modification d'un fichier de l'app → nouveau hash → nouveau cache.
//
// Usage :
//   node scripts/versionner-cache.js            — régénère NOM_CACHE si besoin
//   node scripts/versionner-cache.js --check    — vérifie sans écrire (exit 1 si périmé)
//
// À lancer après chaque modification des fichiers de l'app, avant commit/push.
// Les marqueurs « >>> … » délimitent les zones gérées automatiquement dans
// service-worker.js — ne pas les modifier à la main.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const CHEMIN_SW = path.join(RACINE, 'service-worker.js');

const MARQUEUR_DEBUT_LISTE = '// >>> LISTE_FICHIERS_A_CACHER';
const MARQUEUR_FIN_LISTE = '// >>> FIN_LISTE_FICHIERS_A_CACHER';
const MARQUEUR_DEBUT_VERSION = '// >>> CACHE_VERSION_AUTOMATIQUE';
const MARQUEUR_FIN_VERSION = '// >>> FIN_CACHE_VERSION_AUTOMATIQUE';

/**
 * Extrait le texte entre deux marqueurs (sans les marqueurs eux-mêmes).
 */
function extraireEntre(contenu, debut, fin) {
  const i = contenu.indexOf(debut);
  const j = contenu.indexOf(fin);
  if (i === -1 || j === -1 || j <= i) {
    throw new Error(`Marqueurs introuvables dans service-worker.js (« ${debut} ») — le fichier a-t-il été modifié à la main ?`);
  }
  return contenu.slice(i + debut.length, j);
}

/**
 * Liste des fichiers mis en cache (déclarée une seule fois, dans service-worker.js).
 */
function extraireListeFichiers(contenu) {
  const bloc = extraireEntre(contenu, MARQUEUR_DEBUT_LISTE, MARQUEUR_FIN_LISTE);
  const fichiers = [];
  const regex = /'([^']+)'/g;
  let correspondance;
  while ((correspondance = regex.exec(bloc)) !== null) {
    fichiers.push(correspondance[1]);
  }
  if (fichiers.length === 0) {
    throw new Error('Aucun fichier trouvé dans la liste à hacher.');
  }
  return fichiers;
}

/**
 * Version actuelle (valeur entre guillemets de « const NOM_CACHE = … »).
 */
function extraireVersion(contenu) {
  const bloc = extraireEntre(contenu, MARQUEUR_DEBUT_VERSION, MARQUEUR_FIN_VERSION);
  const correspondance = bloc.match(/const NOM_CACHE = '([^']+)';/);
  return correspondance ? correspondance[1] : null;
}

/**
 * Hash agrégé du contenu des fichiers (sha256, préfixe de 12 caractères hex).
 */
function calculerVersion(fichiers) {
  const hacheur = crypto.createHash('sha256');
  for (const fichier of fichiers) {
    hacheur.update(fs.readFileSync(path.join(RACINE, fichier)));
    hacheur.update('\0'); // séparateur : évite les ambiguïtés entre fichiers
  }
  return 'vocab-cache-' + hacheur.digest('hex').slice(0, 12);
}

function main() {
  const contenu = fs.readFileSync(CHEMIN_SW, 'utf8');
  const fichiers = extraireListeFichiers(contenu);
  const version = calculerVersion(fichiers);
  const versionActuelle = extraireVersion(contenu);

  if (versionActuelle === version) {
    console.log(`✓ Cache à jour : ${version} (${fichiers.length} fichiers, aucun changement)`);
    return;
  }

  if (process.argv.includes('--check')) {
    console.error(`✗ Cache périmé : attendu ${version}, trouvé ${versionActuelle || '(vide)'}.`);
    console.error('  Lancez : node scripts/versionner-cache.js');
    process.exit(1);
  }

  const ancienBloc = extraireEntre(contenu, MARQUEUR_DEBUT_VERSION, MARQUEUR_FIN_VERSION);
  const nouveauBloc = `\nconst NOM_CACHE = '${version}';\n`;
  const nouveau = contenu.replace(
    `${MARQUEUR_DEBUT_VERSION}${ancienBloc}${MARQUEUR_FIN_VERSION}`,
    `${MARQUEUR_DEBUT_VERSION}${nouveauBloc}${MARQUEUR_FIN_VERSION}`
  );
  fs.writeFileSync(CHEMIN_SW, nouveau);
  console.log(`✓ Cache mis à jour : ${versionActuelle || '(vide)'} → ${version} (${fichiers.length} fichiers hachés)`);
}

main();
