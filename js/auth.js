// auth.js — authentification Supabase (connexion, inscription, session, déconnexion)
//
// Principe : l'app reste 100 % utilisable sans compte (mode invité). La connexion
// est une option qui active la synchronisation (voir sync.js). Aucun mur de
// connexion : l'écran d'authentification est accessible volontairement depuis
// Paramètres → Compte.

// Utilisateur connecté (null = mode invité)
let utilisateurCourant = null;

// Client Supabase (créé si la configuration est valide)
let clientSupabase = null;

/**
 * La configuration Supabase (js/config.js) est-elle remplie ?
 * @returns {boolean}
 */
function configSupabaseValide() {
  const config = window.SUPABASE_CONFIG;
  return Boolean(
    config
    && config.url
    && config.anonKey
    && !config.url.includes('TON-PROJET')
    && !config.anonKey.includes('TA_CLE')
    && typeof supabase !== 'undefined'
  );
}

/**
 * Utilisateur actuellement connecté.
 * @returns {{id: string, email: string}|null}
 */
function obtenirUtilisateurCourant() {
  return utilisateurCourant;
}

/**
 * Id Supabase de l'utilisateur connecté (null en mode invité).
 * Utilisé par db.js pour attribuer les enregistrements créés.
 * @returns {string|null}
 */
function obtenirUtilisateurCourantId() {
  return utilisateurCourant ? utilisateurCourant.id : null;
}

/**
 * Client Supabase (utilisé par sync.js).
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
function obtenirClientSupabase() {
  return clientSupabase;
}

/**
 * Affiche un message d'état dans l'écran Connexion.
 * @param {string} texte - Message à afficher
 * @param {'info'|'erreur'} type
 */
function afficherMessageConnexion(texte, type = 'info') {
  const message = document.getElementById('message-connexion');
  message.textContent = texte;
  message.hidden = false;
  message.className = `message-connexion message-${type}`;
}

/**
 * Nettoie le message d'état de l'écran Connexion.
 */
function effacerMessageConnexion() {
  const message = document.getElementById('message-connexion');
  message.hidden = true;
  message.textContent = '';
}

// ---- Écran Connexion : actions ----

/**
 * Connexion par email + mot de passe.
 */
function seConnecter() {
  const email = document.getElementById('champ-email').value.trim();
  const motDePasse = document.getElementById('champ-motdepasse').value;
  effacerMessageConnexion();

  if (!clientSupabase) {
    afficherMessageConnexion('Supabase n\'est pas configuré : renseignez js/config.js puis rechargez l\'app.', 'erreur');
    return;
  }

  clientSupabase.auth.signInWithPassword({ email, password: motDePasse })
    .then(({ error }) => {
      if (error) {
        throw error;
      }
      // La session est posée par onAuthStateChange → migration + sync automatiques
      effacerMessageConnexion();
      // Affiche la section Compte (paramètres) pour voir l'état connecté + sync
      afficherEcran('parametres-compte');
    })
    .catch((erreur) => {
      const message = erreur && erreur.message
        ? erreur.message
        : 'Impossible de se connecter.';
      afficherMessageConnexion(erreurTraduite(message), 'erreur');
    });
}

/**
 * Inscription (email + mot de passe).
 */
function sinscrire() {
  const email = document.getElementById('champ-email').value.trim();
  const motDePasse = document.getElementById('champ-motdepasse').value;
  effacerMessageConnexion();

  if (!clientSupabase) {
    afficherMessageConnexion('Supabase n\'est pas configuré : renseignez js/config.js puis rechargez l\'app.', 'erreur');
    return;
  }

  clientSupabase.auth.signUp({ email, password: motDePasse })
    .then(({ data, error }) => {
      if (error) {
        throw error;
      }
      if (data.session) {
        // Confirmation d'email désactivée : la session est immédiate
        afficherEcran('parametres-compte');
      } else {
        // Confirmation d'email activée : prévenir l'utilisateur
        afficherMessageConnexion(
          'Compte créé ! Un email de confirmation vous a été envoyé. Vérifiez votre boîte de réception puis reconnectez-vous.'
        );
      }
    })
    .catch((erreur) => {
      const message = erreur && erreur.message
        ? erreur.message
        : 'Impossible de créer le compte.';
      afficherMessageConnexion(erreurTraduite(message), 'erreur');
    });
}

/**
 * Envoie un email de réinitialisation de mot de passe.
 */
function motDePasseOublie() {
  const email = document.getElementById('champ-email').value.trim();
  if (!email) {
    afficherMessageConnexion('Saisissez d\'abord votre email.', 'erreur');
    return;
  }
  if (!clientSupabase) {
    afficherMessageConnexion('Supabase n\'est pas configuré : renseignez js/config.js puis rechargez l\'app.', 'erreur');
    return;
  }
  clientSupabase.auth.resetPasswordForEmail(email)
    .then(({ error }) => {
      if (error) {
        throw error;
      }
      afficherMessageConnexion('Email de réinitialisation envoyé si ce compte existe.');
    })
    .catch((erreur) => {
      afficherMessageConnexion(erreurTraduite(erreur.message), 'erreur');
    });
}

/**
 * Déconnexion : la session est invalidée localement, les données locales
 * restent sur l'appareil (elles ne sont pas effacées).
 */
function seDeconnecter() {
  if (!clientSupabase) {
    return;
  }
  // Déconnexion volontaire : le retour au mur ne doit PAS afficher
  // le message « session expirée ».
  deconnexionExplicite = true;
  clientSupabase.auth.signOut()
    .catch((erreur) => console.error('Erreur lors de la déconnexion', erreur));
}

/**
 * Traduit les erreurs d'authentification courantes en messages clairs.
 * @param {string} message
 * @returns {string}
 */
function erreurTraduite(message) {
  const bas = (message || '').toLowerCase();
  if (bas.includes('invalid login credentials') || bas.includes('invalid credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (bas.includes('already registered') || bas.includes('already been registered')) {
    return 'Un compte existe déjà avec cet email. Connectez-vous ou utilisez « mot de passe oublié ».';
  }
  if (bas.includes('password should be at least')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  if (bas.includes('email not confirmed')) {
    return 'Email non confirmé : vérifiez votre boîte de réception, ou utilisez « mot de passe oublié ».';
  }
  if (bas.includes('failed to fetch') || bas.includes('network')) {
    return 'Connexion internet requise pour se connecter. Vérifiez votre réseau puis réessayez.';
  }
  if (bas.includes('email address is invalid') || bas.includes('invalid email')) {
    return 'Adresse email invalide.';
  }
  if (bas.includes('rate limit') || bas.includes('too many requests') || bas.includes('429')) {
    return 'Trop de tentatives (limite de sécurité). Réessayez plus tard, idéalement dans une heure.';
  }
  if (bas.includes('different from the old password') || bas.includes('different from your old password')) {
    return 'Le nouveau mot de passe doit être différent de l\'ancien.';
  }
  if (bas.includes('already confirmed')) {
    return 'Cet email est déjà confirmé.';
  }
  if (bas.includes('password')) {
    return 'Mot de passe refusé. Vérifiez qu\'il fait au moins 6 caractères.';
  }
  return message || 'Erreur inconnue.';
}

// ---- Actions de la section Compte (Paramètres) ----

/**
 * Affiche un message dans la section Compte (paramètres).
 * @param {string} texte
 * @param {'info'|'erreur'} type
 */
function afficherMessageCompte(texte, type = 'info') {
  const message = document.getElementById('message-compte');
  if (!message) {
    return;
  }
  message.textContent = texte;
  message.hidden = false;
  message.className = `message-connexion message-${type}`;
}

/**
 * Efface le message de la section Compte.
 */
function effacerMessageCompte() {
  const message = document.getElementById('message-compte');
  if (!message) {
    return;
  }
  message.hidden = true;
  message.textContent = '';
}

/**
 * Affiche ou masque le formulaire de changement de mot de passe, et met à jour
 * le libellé du bouton qui le contrôle.
 */
function basculerFormulaireMotDePasse() {
  const form = document.getElementById('form-changer-motdepasse');
  const bouton = document.getElementById('btn-changer-motdepasse');
  if (!form || !bouton) {
    return;
  }
  form.hidden = !form.hidden;
  bouton.textContent = form.hidden ? 'Changer le mot de passe' : 'Annuler';
  if (form.hidden) {
    effacerMessageCompte();
  } else {
    document.getElementById('champ-nouveau-motdepasse').focus();
  }
}

/**
 * Change le mot de passe de l'utilisateur connecté (session déjà active).
 */
function changerMotDePasse() {
  const nouveau = document.getElementById('champ-nouveau-motdepasse').value;
  const confirmation = document.getElementById('champ-confirmation-motdepasse').value;
  effacerMessageCompte();

  if (nouveau.length < 6) {
    afficherMessageCompte('Le mot de passe doit contenir au moins 6 caractères.', 'erreur');
    return;
  }
  if (nouveau !== confirmation) {
    afficherMessageCompte('Les deux mots de passe ne correspondent pas.', 'erreur');
    return;
  }
  if (!clientSupabase) {
    afficherMessageCompte('Supabase n\'est pas configuré : renseignez js/config.js puis rechargez l\'app.', 'erreur');
    return;
  }

  clientSupabase.auth.updateUser({ password: nouveau })
    .then(({ error }) => {
      if (error) {
        throw error;
      }
      afficherMessageCompte('Mot de passe modifié avec succès.', 'info');
      // Referme le formulaire et vide les champs
      const form = document.getElementById('form-changer-motdepasse');
      form.hidden = true;
      document.getElementById('btn-changer-motdepasse').textContent = 'Changer le mot de passe';
      document.getElementById('champ-nouveau-motdepasse').value = '';
      document.getElementById('champ-confirmation-motdepasse').value = '';
    })
    .catch((erreur) => {
      afficherMessageCompte(erreurTraduite(erreur && erreur.message), 'erreur');
    });
}

/**
 * Renvoie l'email de confirmation (utilisable quand le compte n'est pas confirmé).
 */
function renvoyerEmailConfirmation() {
  if (!clientSupabase || !utilisateurCourant) {
    return;
  }
  effacerMessageCompte();
  clientSupabase.auth.resend({ type: 'signup', email: utilisateurCourant.email })
    .then(({ error }) => {
      if (error) {
        throw error;
      }
      afficherMessageCompte('Email de confirmation renvoyé. Vérifiez votre boîte de réception.', 'info');
    })
    .catch((erreur) => {
      afficherMessageCompte(erreurTraduite(erreur && erreur.message), 'erreur');
    });
}

// ---- Section Compte (écran Paramètres) ----

/**
 * (Re)rend la section « Compte & Synchronisation » de l'écran Paramètres.
 * Appelée à chaque affichage de l'écran Paramètres et après chaque changement
 * de session.
 */
function afficherZoneCompte() {
  const zone = document.getElementById('zone-compte');
  if (!zone) {
    return;
  }
  zone.innerHTML = '';

  if (!configSupabaseValide()) {
    zone.innerHTML = '<p class="conseil">Supabase n\'est pas encore configuré. Renseignez l\'URL de votre projet et la clé publique (anon) dans le fichier <code>js/config.js</code>, puis rechargez l\'app. Voir aussi <code>supabase/schema.sql</code> pour créer les tables.</p>';
    return;
  }

  if (!utilisateurCourant) {
    const conseil = document.createElement('p');
    conseil.className = 'conseil';
    conseil.textContent = 'Vous n\'êtes pas connecté — vos données restent uniquement sur cet appareil.';

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.id = 'btn-ouvrir-connexion';
    bouton.textContent = 'Se connecter / Créer un compte';
    bouton.addEventListener('click', () => {
      effacerMessageConnexion();
      afficherEcran('connexion');
    });

    zone.append(conseil, bouton);
    return;
  }

  const email = document.createElement('p');
  email.className = 'compte-email';
  email.textContent = `👤 ${utilisateurCourant.email}`;

  // Badge de confirmation d'email (avec bouton de renvoi si non confirmé)
  const confirmation = document.createElement('p');
  confirmation.className = 'compte-confirmation';
  if (utilisateurCourant.emailConfirme) {
    confirmation.textContent = '✅ Email confirmé';
    confirmation.classList.add('confirme');
  } else {
    confirmation.textContent = '⚠️ Email non confirmé — renvoyez le lien si nécessaire.';
    confirmation.classList.add('non-confirme');
  }

  // Statut de synchronisation : rempli par sync.js
  const statut = document.createElement('div');
  statut.id = 'zone-statut-sync';
  statut.className = 'statut-sync';

  // Message de retour des actions (changement de mot de passe, renvoi d'email)
  const message = document.createElement('div');
  message.id = 'message-compte';
  message.className = 'message-connexion';
  message.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'actions-compte';

  const btnSynchroniser = document.createElement('button');
  btnSynchroniser.type = 'button';
  btnSynchroniser.id = 'btn-synchroniser';
  btnSynchroniser.textContent = 'Synchroniser maintenant';
  btnSynchroniser.addEventListener('click', () => {
    if (typeof synchroniser === 'function') {
      synchroniser();
    }
  });

  const btnChangerMdp = document.createElement('button');
  btnChangerMdp.type = 'button';
  btnChangerMdp.id = 'btn-changer-motdepasse';
  btnChangerMdp.className = 'btn-secondaire';
  btnChangerMdp.textContent = 'Changer le mot de passe';
  btnChangerMdp.addEventListener('click', basculerFormulaireMotDePasse);

  const btnRenvoyer = document.createElement('button');
  btnRenvoyer.type = 'button';
  btnRenvoyer.id = 'btn-renvoyer-confirmation';
  btnRenvoyer.className = 'btn-secondaire';
  btnRenvoyer.textContent = 'Renvoyer l\'email de confirmation';
  btnRenvoyer.hidden = utilisateurCourant.emailConfirme;
  btnRenvoyer.addEventListener('click', renvoyerEmailConfirmation);

  const btnDeconnexion = document.createElement('button');
  btnDeconnexion.type = 'button';
  btnDeconnexion.className = 'btn-secondaire';
  btnDeconnexion.textContent = 'Se déconnecter';
  btnDeconnexion.addEventListener('click', seDeconnecter);

  actions.append(btnSynchroniser, btnChangerMdp, btnRenvoyer, btnDeconnexion);
  zone.append(email, confirmation, statut, message, actions);

  // Formulaire de changement de mot de passe (masqué par défaut)
  const form = document.createElement('form');
  form.id = 'form-changer-motdepasse';
  form.hidden = true;
  form.innerHTML = `
    <label for="champ-nouveau-motdepasse">Nouveau mot de passe (6 caractères min.)</label>
    <input type="password" id="champ-nouveau-motdepasse" minlength="6" required autocomplete="new-password">
    <label for="champ-confirmation-motdepasse">Confirmer le nouveau mot de passe</label>
    <input type="password" id="champ-confirmation-motdepasse" required autocomplete="new-password">
    <div class="actions-formulaire">
      <button type="submit">Enregistrer</button>
      <button type="button" class="btn-lien" id="btn-annuler-motdepasse">Annuler</button>
    </div>
  `;
  form.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    changerMotDePasse();
  });
  form.querySelector('#btn-annuler-motdepasse').addEventListener('click', basculerFormulaireMotDePasse);
  zone.append(form);

  // Met à jour le statut immédiatement (sync.js remplit #zone-statut-sync)
  if (typeof mettreAJourIndicateurSync === 'function') {
    mettreAJourIndicateurSync();
  }
}

// ---- Branchements de l'écran Connexion ----

// Garde anti double-branchement : initialiserAuth peut être appelé plusieurs
// fois (ex : restauration de session), les écouteurs ne doivent pas être posés
// deux fois.
let ecranConnexionBranche = false;

// Mode courant de l'écran Connexion : 'connexion' ou 'inscription'
let modeConnexion = 'connexion';

// Vrai quand la déconnexion vient d'un choix explicite de l'utilisateur
// (bouton « Se déconnecter ») et non d'une expiration de session.
// Permet de distinguer « session expirée » de « déconnexion volontaire »
// dans l'écouteur onAuthStateChange (les deux émettent SIGNED_OUT).
let deconnexionExplicite = false;

/**
 * Bascule l'écran Connexion entre les modes « Connexion » et « Inscription »
 * (onglets visuels) : met à jour les onglets, le libellé du bouton principal
 * et les champs (autocomplete), et efface le message d'état.
 * @param {'connexion'|'inscription'} mode
 */
function definirModeConnexion(mode) {
  modeConnexion = mode;
  const ongletConnexion = document.getElementById('btn-onglet-connexion');
  const ongletInscription = document.getElementById('btn-onglet-inscription');
  const boutonPrincipal = document.getElementById('btn-se-connecter');
  const lienMdp = document.getElementById('btn-motdepasse-oublie');
  const champMotDePasse = document.getElementById('champ-motdepasse');

  const estInscription = mode === 'inscription';
  ongletConnexion.classList.toggle('active', !estInscription);
  ongletConnexion.setAttribute('aria-selected', String(!estInscription));
  ongletInscription.classList.toggle('active', estInscription);
  ongletInscription.setAttribute('aria-selected', String(estInscription));

  boutonPrincipal.textContent = estInscription ? 'Créer mon compte' : 'Se connecter';
  lienMdp.hidden = estInscription;
  champMotDePasse.autocomplete = estInscription ? 'new-password' : 'current-password';

  effacerMessageConnexion();
}

function brancherEcranConnexion() {
  if (ecranConnexionBranche) {
    return;
  }
  ecranConnexionBranche = true;

  // La soumission déclenche la connexion ou l'inscription selon l'onglet actif
  document.getElementById('form-connexion').addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    if (modeConnexion === 'inscription') {
      sinscrire();
    } else {
      seConnecter();
    }
  });

  // Bascule entre les deux modes
  document.getElementById('btn-onglet-connexion').addEventListener('click', () => definirModeConnexion('connexion'));
  document.getElementById('btn-onglet-inscription').addEventListener('click', () => definirModeConnexion('inscription'));

  // « Mot de passe oublié ? » (visible en mode Connexion uniquement)
  document.getElementById('btn-motdepasse-oublie').addEventListener('click', motDePasseOublie);

  // État initial : onglet Connexion actif
  definirModeConnexion('connexion');
}

// ---- Initialisation ----

/**
 * Initialise l'authentification : crée le client Supabase si configuré,
 * restaure la session persistée et écoute les changements de session.
 */
function initialiserAuth() {
  brancherEcranConnexion();

  if (!configSupabaseValide()) {
    console.warn('Supabase non configuré : l\'app fonctionne en mode local uniquement (voir js/config.js).');
    return;
  }

  clientSupabase = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Réagit aux changements de session : connexion, déconnexion, rafraîchissement du token
  clientSupabase.auth.onAuthStateChange((evenement, session) => {
    if (evenement === 'SIGNED_OUT') {
      // SIGNED_OUT survient soit après une déconnexion volontaire, soit quand
      // la session expire (token invalide/rafraîchissement impossible).
      const sessionExpiree = !deconnexionExplicite;
      deconnexionExplicite = false;

      utilisateurCourant = null;
      if (typeof arreterSync === 'function') {
        arreterSync();
      }
      afficherZoneCompte();
      // Retour à la page de connexion (mur de connexion : seul un compte donne accès)
      afficherEcran('connexion');

      if (sessionExpiree) {
        afficherMessageConnexion(
          'Votre session a expiré. Reconnectez-vous pour continuer — vos données restent en sécurité sur cet appareil.',
          'info'
        );
      } else {
        effacerMessageConnexion();
      }
      return;
    }

    if (session) {
      utilisateurCourant = {
        id: session.user.id,
        email: session.user.email,
        emailConfirme: !!session.user.email_confirmed_at
      };
      const cleMigration = `sync_migre_${session.user.id}`;

      if (localStorage.getItem(cleMigration) !== '1') {
        // Premier login sur cet appareil : migre les données locales puis synchronise.
        // En cas d'échec (réseau coupé au moment de la connexion), la boucle
        // périodique est quand même lancée ; la migration sera retentée à la
        // prochaine ouverture de session.
        migrerEtSynchroniser()
          .then(() => localStorage.setItem(cleMigration, '1'))
          .catch((erreur) => console.error('Erreur lors de la migration des données locales', erreur))
          .finally(() => {
            if (typeof demarrerSyncPourUtilisateur === 'function') {
              demarrerSyncPourUtilisateur();
            }
          });
      } else if (typeof demarrerSyncPourUtilisateur === 'function') {
        demarrerSyncPourUtilisateur();
      }
      afficherZoneCompte();

      // Au démarrage : une session restaurée ouvre directement l'application
      // (les connexions/inscriptions faites depuis le formulaire naviguent déjà
      // vers Paramètres dans seConnecter()/sinscrire()).
      if (evenement === 'INITIAL_SESSION') {
        afficherEcran('liste');
      }
    }
  });

  // Restaure la session existante (déclenche l'événement INITIAL_SESSION)
  clientSupabase.auth.getSession()
    .catch((erreur) => console.error('Erreur lors de la restauration de la session', erreur));
}
