-- ============================================================
-- Mon Vocabulaire — schéma Supabase (étape 2 du plan)
-- À exécuter dans le SQL Editor de votre projet Supabase.
--
-- Crée les tables « mots » et « categories » (miroir des données
-- locales), active la sécurité par ligne (RLS) et les index de sync.
--
-- Après exécution : récupérez l'URL du projet et la clé publique
-- (anon) dans Project Settings → API, puis renseignez js/config.js.
-- ============================================================

-- ---- Table : categories ----
create table if not exists public.categories (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  nom              text not null,
  parent_id        uuid,
  est_par_defaut   boolean not null default false,
  date_creation    timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  supprime         boolean not null default false
);

-- ---- Table : mots ----
create table if not exists public.mots (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  mot               text not null,
  definition        text not null default '',
  exemple           text not null default '',
  langue            text not null default '',
  categorie_ids     uuid[] not null default '{}',
  niveau_maitrise   text not null default 'nouveau',
  repetition        integer not null default 0,
  ease_facteur      double precision not null default 2.5,
  intervalle_jours  integer,
  prochaine_revision text,
  historique_revision jsonb not null default '[]'::jsonb,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  supprime          boolean not null default false
);

-- ---- Sécurité par ligne (RLS) : chaque utilisateur ne voit que ses données ----
alter table public.categories enable row level security;
alter table public.mots enable row level security;

create policy "categories_select_own" on public.categories
  for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete_own" on public.categories
  for delete using (user_id = auth.uid());

create policy "mots_select_own" on public.mots
  for select using (user_id = auth.uid());
create policy "mots_insert_own" on public.mots
  for insert with check (user_id = auth.uid());
create policy "mots_update_own" on public.mots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mots_delete_own" on public.mots
  for delete using (user_id = auth.uid());

-- ---- Index recommandés (toutes les requêtes de sync filtrent par utilisateur) ----
create index if not exists idx_categories_user_id on public.categories (user_id);
create index if not exists idx_categories_date_modification on public.categories (date_modification);
create index if not exists idx_mots_user_id on public.mots (user_id);
create index if not exists idx_mots_date_modification on public.mots (date_modification);

-- ---- Realtime : synchronisation instantanée entre appareils ----
-- OBLIGATOIRE : sans ces lignes, Supabase ne publie PAS les changements sur
-- Realtime (les tables ne sont pas dans la publication par défaut) et l'app
-- se rabat sur le polling de secours (60 s). À exécuter UNE FOIS (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mots') then
    alter publication supabase_realtime add table public.mots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
end $$;

-- ---- V3.2 : révision espacée (SM-2) — colonnes sur « mots » ----
-- Pour un projet existant (les tables ont déjà été créées par l'ancien schéma),
-- ajoute les colonnes SM-2. Idempotent, peut être ré-exécuté.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mots' and column_name = 'repetition') then
    alter table public.mots add column repetition integer not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mots' and column_name = 'ease_facteur') then
    alter table public.mots add column ease_facteur double precision not null default 2.5;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mots' and column_name = 'intervalle_jours') then
    alter table public.mots add column intervalle_jours integer;
  end if;
end $$;

-- ---- V3.2 : notifications push (Web Push) ----
-- Table des abonnements push par utilisateur. Idempotent.
create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  endpoint       text not null unique,
  cle_p256dh     text not null,
  cle_auth       text not null,
  date_creation  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

-- Politiques RLS : chaque utilisateur gère SES abonnements (la Edge Function
-- « envoyer-rappels » utilise la clé service_role, non soumise à la RLS).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_select_own') then
    create policy "push_select_own" on public.push_subscriptions
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_insert_own') then
    create policy "push_insert_own" on public.push_subscriptions
      for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_delete_own') then
    create policy "push_delete_own" on public.push_subscriptions
      for delete using (user_id = auth.uid());
  end if;
  -- IMPORTANT : l'upsert client utilise onConflict 'endpoint' → INSERT ... ON
  -- CONFLICT DO UPDATE. Sous RLS, cette forme exige la politique UPDATE en PLUS
  -- de la politique INSERT, sinon le ré-abonnement (endpoint déjà enregistré)
  -- échoue silencieusement (console.warn).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_update_own') then
    create policy "push_update_own" on public.push_subscriptions
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ---- Vérification (facultatif) ----
-- select * from pg_policies where tablename in ('mots', 'categories');
