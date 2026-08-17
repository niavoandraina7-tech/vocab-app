// supabase/functions/envoyer-rappels/index.ts
// Envoie une notification push (Web Push) aux utilisateurs qui ont des mots de
// vocabulaire en retard de révision, même quand l'app est fermée.
//
// Prérequis :
//   - Table « push_subscriptions » créée (voir supabase/schema.sql, bloc V3.2).
//   - Clés VAPID : VAPID_PUBLIC_KEY (dans js/config.js) et VAPID_PRIVATE_KEY
//     (dans vapid-prive.txt) définies comme variables d'environnement de la
//     fonction (dashboard Supabase → Edge Functions → env vars).
//   - Déclenchement périodique : cron externe (ex. cron-job.org) ou pg_cron.
//     Voir le README.md du dossier.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_SUJET = 'mailto:contact@mon-vocabulaire.app';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
// Un mot est « en retard » si sa prochaine révision est dépassée depuis au
// moins ce nombre de jours (même seuil que le réglage par défaut de l'app).
const SEUIL_RETARD_JOURS = 2;

webpush.setVapidDetails(VAPID_SUJET, VAPID_PUBLIC, VAPID_PRIVE);

Deno.serve(async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVE) {
    return new Response('Clés VAPID manquantes (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)', { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  const seuil = new Date(Date.now() - SEUIL_RETARD_JOURS * 24 * 60 * 60 * 1000).toISOString();

  // Mots en retard : prochaine révision atteinte depuis le seuil, ou jamais
  // programmés mais créés avant le seuil (jamais révisés).
  const { data: mots, error: erreurMots } = await supabase
    .from('mots')
    .select('id, user_id')
    .eq('supprime', false)
    .or(`prochaine_revision.lte.${seuil},and(prochaine_revision.is.null,date_creation.lte.${seuil})`);

  if (erreurMots) {
    return new Response(`Erreur lecture « mots » : ${erreurMots.message}`, { status: 500 });
  }

  const parUtilisateur = new Map();
  for (const mot of mots || []) {
    parUtilisateur.set(mot.user_id, (parUtilisateur.get(mot.user_id) || 0) + 1);
  }
  const userIds = [...parUtilisateur.keys()];
  if (userIds.length === 0) {
    return Response.json({ envoyes: 0, detail: 'aucun mot en retard' });
  }

  const { data: abonnements } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, cle_p256dh, cle_auth')
    .in('user_id', userIds);

  let envoyes = 0;
  let echecs = 0;
  for (const abonnement of abonnements || []) {
    const compte = parUtilisateur.get(abonnement.user_id) || 0;
    const payload = JSON.stringify({
      title: 'Mon Vocabulaire',
      body: `${compte} mot(s) attendent une révision depuis plus de ${SEUIL_RETARD_JOURS} jour(s).`
    });
    try {
      await webpush.sendNotification(
        { endpoint: abonnement.endpoint, keys: { p256dh: abonnement.cle_p256dh, auth: abonnement.cle_auth } },
        payload
      );
      envoyes++;
    } catch (erreur) {
      echecs++;
      // Abonnement expiré/invalide (410 Gone) : on le supprime pour ne plus re-essayer
      if (erreur && erreur.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', abonnement.endpoint).catch(() => {});
      }
    }
  }

  return Response.json({ envoyes, echecs });
});
