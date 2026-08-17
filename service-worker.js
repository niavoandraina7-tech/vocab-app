// service-worker.js — cache des fichiers de l'application pour le mode hors ligne
//
// Stratégie de mise à jour : NOM_CACHE est généré automatiquement à partir du
// contenu des fichiers (hash SHA-256) par scripts/versionner-cache.js — NE PAS
// le modifier à la main. Toute modification d'un fichier de l'app change le
// hash, donc le nom du cache, donc force le re-téléchargement chez les
// utilisateurs. Zones délimitées par « >>> … » : gérées par le script.

// >>> CACHE_VERSION_AUTOMATIQUE
const NOM_CACHE = 'vocab-cache-16ff76d5907d';
// >>> FIN_CACHE_VERSION_AUTOMATIQUE

// Tous les fichiers statiques nécessaires au fonctionnement hors ligne.
// >>> LISTE_FICHIERS_A_CACHER
const FICHIERS_A_CACHER = [
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/config.js',
  'js/theme.js',
  'js/vendor/supabase.min.js',
  'js/db.js',
  'js/categories.js',
  'js/mots.js',
  'js/revision.js',
  'js/rappels.js',
  'js/vocal.js',
  'js/quiz.js',
  'js/export-import.js',
  'js/statistiques.js',
  'js/push.js',
  'js/auth.js',
  'js/sync.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];
// >>> FIN_LISTE_FICHIERS_A_CACHER

// Installation : pré-cache de tous les fichiers statiques
self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(NOM_CACHE)
      .then((cache) => cache.addAll(FICHIERS_A_CACHER))
      .then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches (mise à jour de version)
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(
        cles
          .filter((cle) => cle !== NOM_CACHE)
          .map((cle) => caches.delete(cle))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch : stratégie « cache d'abord, réseau en secours »
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  // IMPORTANT : les appels vers Supabase (auth, REST) ne doivent JAMAIS être
  // servis depuis le cache ni mis en cache — ils doivent toujours aller au
  // réseau pour garantir des données fraîches et une session valide.
  if (requete.url.includes('supabase.co')) {
    return;
  }

  // Requêtes de navigation : servir la page en cache pour un rechargement hors ligne
  if (requete.mode === 'navigate') {
    evenement.respondWith(
      caches.match('index.html').then((enCache) => enCache || fetch(requete))
    );
    return;
  }

  evenement.respondWith(
    caches.match(requete).then((enCache) => {
      if (enCache) {
        return enCache;
      }
      return fetch(requete).then((reponse) => {
        // Met en cache les nouvelles ressources (même origine, GET uniquement)
        if (reponse && reponse.status === 200 && requete.method === 'GET') {
          const copie = reponse.clone();
          caches.open(NOM_CACHE).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      });
    })
  );
});

// Notification push : envoyée par la Edge Function « envoyer-rappels » même
// quand l'app est fermée. Le payload est un JSON { title, body }.
self.addEventListener('push', (evenement) => {
  let donnees = { title: 'Mon Vocabulaire', body: 'Des mots attendent une révision !' };
  try {
    if (evenement.data) {
      const analyse = JSON.parse(evenement.data.text());
      if (analyse && analyse.title) {
        donnees = analyse;
      }
    }
  } catch (erreur) {
    // Payload non JSON : on garde le message par défaut
  }

  evenement.waitUntil(
    self.registration.showNotification(donnees.title, {
      body: donnees.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: './' }
    })
  );
});

// Clic sur la notification : focus la fenêtre ouverte (et demande d'ouvrir
// l'onglet Jeu via postMessage), sinon rouvre l'app.
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  evenement.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      if (fenetres[0]) {
        fenetres[0].focus();
        fenetres[0].postMessage({ type: 'ouvrir-revision' });
        return;
      }
      return clients.openWindow((evenement.notification.data && evenement.notification.data.url) || './');
    })
  );
});
