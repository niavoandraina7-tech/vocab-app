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

-- ---- Vérification (facultatif) ----
-- select * from pg_policies where tablename in ('mots', 'categories');
