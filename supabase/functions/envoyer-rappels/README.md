# Edge Function « envoyer-rappels » — notifications push

Envoie une notification push aux utilisateurs connectés qui ont des mots de
vocabulaire **en retard de révision** (prochaine révision dépassée depuis ≥ 2
jours), même quand l'app est fermée. Le client (`js/push.js`) enregistre les
abonnements du navigateur dans la table `push_subscriptions` ; cette fonction
les utilise pour envoyer via **Web Push (VAPID)**.

## Déploiement (une seule fois)

1. **SQL** : exécuter le bloc « V3.2 : notifications push » de
   `supabase/schema.sql` (table `push_subscriptions` + politiques RLS).
2. **Clés VAPID** :
   - publique : déjà dans `js/config.js` (`vapidPublicKey`) ;
   - privée : dans `vapid-prive.txt` (fichier local, **jamais commité**).
3. **Déployer la fonction** :
   ```bash
   supabase functions deploy envoyer-rappels
   ```
   (ou via le dashboard Supabase → Edge Functions → Create a new function,
   en collant le code de `index.ts`).
4. **Variables d'environnement** de la fonction (dashboard → Edge Functions →
   votre fonction → Settings → Environment variables) :
   - `VAPID_PUBLIC_KEY` = la clé publique (identique à celle de `config.js`)
   - `VAPID_PRIVATE_KEY` = la clé privée (`vapid-prive.txt`)

   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement
   par Supabase.

## Planification (l'app ne peut pas s'envoyer de push toute seule)

La fonction doit être appelée périodiquement. Deux options :

**Option A — pg_cron (dans la base)** : dans le SQL Editor, activer l'extension
`pg_cron` puis planifier un appel toutes les heures avec la clé anon :
```sql
create extension if not exists pg_cron;
select cron.schedule('envoyer-rappels', '0 * * * *',
  $$ select net.http_post(
       url := 'https://<PROJET>.supabase.co/functions/v1/envoyer-rappels',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <CLE_ANON>',
         'apikey', '<CLE_ANON>'
       ),
       body := '{}'
     ) $$);
```

**Option B — cron externe** (ex. [cron-job.org](https://cron-job.org)) : appeler
`https://<PROJET>.supabase.co/functions/v1/envoyer-rappels` toutes les heures,
avec l'en-tête `Authorization: Bearer <CLE_ANON>` (et `apikey`).

> ⚠️ La clé anon est publique par conception : elle ne permet que d'invoquer la
> fonction, pas d'accéder aux données (la fonction utilise en interne la clé
> `service_role`, jamais exposée côté client).
