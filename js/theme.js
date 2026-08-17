// theme.js — mode d'affichage : clair / sombre / système
//
// Le thème est appliqué sur <html data-theme="sombre|clair"> (le CSS définit les
// variables de couleurs dans :root et :root[data-theme='sombre']). Un petit
// script inline dans <head> (index.html) applique déjà le thème avant le premier
// rendu pour éviter le flash clair. Ce fichier gère le sélecteur de Paramètres,
// la persistance (localStorage « modeApparence ») et le suivi du système.

const CLE_MODE_APPARENCE = 'modeApparence'; // 'system' | 'clair' | 'sombre'

/**
 * Choix enregistré par l'utilisateur ('system' par défaut).
 * @returns {'system'|'clair'|'sombre'}
 */
function modeApparenceActuel() {
  const stocke = localStorage.getItem(CLE_MODE_APPARENCE);
  if (stocke === 'clair' || stocke === 'sombre') {
    return stocke;
  }
  return 'system';
}

/**
 * Thème effectif à appliquer (le mode « système » suit la préférence de l'OS).
 * @returns {'clair'|'sombre'}
 */
function themeEffectif() {
  const mode = modeApparenceActuel();
  if (mode !== 'system') {
    return mode;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
}

/**
 * Applique le thème sur <html> + la couleur de la barre navigateur mobile,
 * et synchronise l'état des boutons du sélecteur (Paramètres).
 */
function appliquerTheme() {
  const theme = themeEffectif();
  document.documentElement.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'sombre' ? '#0b1720' : '#f3f8fc');
  }

  const mode = modeApparenceActuel();
  document.querySelectorAll('[data-theme-choix]').forEach((bouton) => {
    const actif = bouton.dataset.themeChoix === mode;
    bouton.classList.toggle('active', actif);
    bouton.setAttribute('aria-pressed', String(actif));
  });
}

/**
 * Branche le sélecteur et le changement de thème système, puis applique.
 */
function initialiserTheme() {
  document.querySelectorAll('[data-theme-choix]').forEach((bouton) => {
    bouton.addEventListener('click', () => {
      localStorage.setItem(CLE_MODE_APPARENCE, bouton.dataset.themeChoix);
      appliquerTheme();
    });
  });

  // En mode « Système », un changement de thème de l'OS est suivi en direct
  const requeteMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const ecouterChangement = () => {
    if (modeApparenceActuel() === 'system') {
      appliquerTheme();
    }
  };
  if (typeof requeteMedia.addEventListener === 'function') {
    requeteMedia.addEventListener('change', ecouterChangement);
  } else if (typeof requeteMedia.addListener === 'function') {
    requeteMedia.addListener(ecouterChangement); // navigateurs anciens
  }

  appliquerTheme();
}

initialiserTheme();
