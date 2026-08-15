// service-worker.js — cache des fichiers de l'application pour le mode hors ligne
//
// Stratégie de mise à jour : quand le contenu de l'app change, incrémenter
// NOM_CACHE (vocab-cache-v2, v3, ...) pour forcer le re-téléchargement.

const NOM_CACHE = 'vocab-cache-v2';

// Tous les fichiers statiques nécessaires au fonctionnement hors ligne
const FICHIERS_A_CACHER = [
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/db.js',
  'js/categories.js',
  'js/mots.js',
  'js/revision.js',
  'js/export-import.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

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
