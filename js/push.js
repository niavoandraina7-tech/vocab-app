// push.js — notifications push (Web Push) via Supabase
//
// Principe : quand l'utilisateur est connecté ET que les rappels sont activés
// ET que la permission Notification est accordée, on abonne le navigateur au
// push (clé VAPID publique de js/config.js) et on enregistre l'abonnement dans
// la table Supabase « push_subscriptions ». La Edge Function « envoyer-rappels »
// (à déployer, voir supabase/functions/envoyer-rappels) envoie alors les
// notifications même quand l'app est fermée.
//
// Ce fichier n'est jamais bloquant : en cas d'échec (pas de VAPID configuré,
// navigateur sans PushManager, erreur réseau…), l'app continue normalement
// avec la notification d'ouverture (rappels.js).

/**
 * La clé publique VAPID est-elle configurée ?
 * @returns {boolean}
 */
function configVapidValide() {
  const config = window.SUPABASE_CONFIG;
  return Boolean(config && config.vapidPublicKey && config.vapidPublicKey.length >= 43);
}

/**
 * Convertit une clé VAPID base64url en Uint8Array (format attendu par
 * PushManager.subscribe).
 * @param {string} base64
 * @returns {Uint8Array}
 */
function urlBase64VersUint8Array(base64) {
  const nettoye = base64.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(nettoye);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) {
    octets[i] = brut.charCodeAt(i);
  }
  return octets;
}

/**
 * Toutes les conditions d'un abonnement push sont-elles réunies ?
 * @returns {boolean}
 */
function pushPossible() {
  return Boolean(
    typeof configSupabaseValide === 'function' && configSupabaseValide()
    && configVapidValide()
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && Notification.permission === 'granted'
    && typeof rappelsActives === 'function' && rappelsActives()
    && obtenirUtilisateurCourant()
  );
}

/**
 * Abonne le navigateur au push et enregistre l'abonnement dans Supabase
 * (upsert sur l'endpoint : pas de doublon si l'abonnement change).
 * Ne fait rien si les conditions ne sont pas réunies. Jamais bloquant.
 * @returns {Promise<boolean>} true si l'abonnement est actif et enregistré
 */
async function abonnerPushSiPossible() {
  if (!pushPossible()) {
    return false;
  }
  const client = obtenirClientSupabase();
  const user = obtenirUtilisateurCourant();
  if (!client || !user) {
    return false;
  }

  try {
    const enregistrement = await navigator.serviceWorker.getRegistration();
    if (!enregistrement) {
      return false;
    }

    let abonnement = await enregistrement.pushManager.getSubscription();
    if (!abonnement) {
      abonnement = await enregistrement.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64VersUint8Array(window.SUPABASE_CONFIG.vapidPublicKey)
      });
    }

    const json = abonnement.toJSON();
    const { error } = await client
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          cle_p256dh: json.keys.p256dh,
          cle_auth: json.keys.auth
        },
        { onConflict: 'endpoint' }
      );
    if (error) {
      throw error;
    }
    return true;
  } catch (erreur) {
    // Non bloquant : la notification d'ouverture (rappels.js) reste active
    console.warn('Abonnement push impossible (non bloquant)', erreur && erreur.message ? erreur.message : erreur);
    return false;
  }
}

/**
 * Désabonne le navigateur et supprime l'abonnement du compte Supabase.
 * Appelé à la déconnexion (userId fourni car l'utilisateur courant est déjà null).
 * @param {string|null} userId - Id Supabase du compte à nettoyer
 * @returns {Promise<void>}
 */
async function desabonnerPush(userId) {
  const client = obtenirClientSupabase();
  try {
    if ('serviceWorker' in navigator) {
      const enregistrement = await navigator.serviceWorker.getRegistration();
      if (enregistrement) {
        const abonnement = await enregistrement.pushManager.getSubscription();
        if (abonnement) {
          await abonnement.unsubscribe();
        }
      }
    }
    if (client && userId) {
      await client.from('push_subscriptions').delete().eq('user_id', userId);
    }
  } catch (erreur) {
    console.warn('Désabonnement push impossible (non bloquant)', erreur && erreur.message ? erreur.message : erreur);
  }
}
