-- =====================================================================
-- CineMatch: tabelas do banco (Supabase / Postgres)
--
-- Como usar: no painel do Supabase, abra "SQL Editor" > "New query",
-- cole este arquivo inteiro e clique em "Run". Pode rodar de novo sem
-- problema (tudo usa "if not exists" / "drop ... if exists").
--
-- Segurança: todas as tabelas têm Row Level Security (RLS).
--   - Tabelas do usuário: cada pessoa só lê e altera os PRÓPRIOS dados.
--   - Tabelas de cache: nenhuma política = só o servidor (service role) acessa.
-- =====================================================================

-- ---------- profiles: dados básicos de cada usuário ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text,
  criado_em     timestamptz not null default now(),
  ultimo_filtro jsonb
);

-- ---------- taste_profiles: o perfil de gosto gerado (IA ou regras) ----------
create table if not exists public.taste_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  perfil        jsonb not null,
  fonte         text not null check (fonte in ('historico', 'quiz', 'combinado')),
  atualizado_em timestamptz not null default now()
);

-- ---------- quiz_answers: uma linha por pergunta respondida ----------
create table if not exists public.quiz_answers (
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   int  not null check (question_id between 1 and 10),
  option_ids    text[] not null default '{}',
  comentario    text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ---------- watch_history_import: histórico da Netflix já agrupado ----------
create table if not exists public.watch_history_import (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  titulo_original  text not null,          -- como veio no CSV (ex.: "Dark")
  titulo_tmdb      text,                   -- como está no TMDB
  tmdb_id          int,                    -- null = não identificado
  tipo             text check (tipo in ('movie', 'tv')),
  episodios_vistos int  not null default 0,
  vezes            int  not null default 1,
  ultima_data      date,
  peso             real not null default 0, -- -1 (largou) a 1 (gosto forte)
  generos          int[] not null default '{}',
  idioma_original  text,
  ano              text,
  poster_path      text,
  importado_em     timestamptz not null default now(),
  unique (user_id, titulo_original)
);
create index if not exists watch_history_user_idx on public.watch_history_import (user_id, peso desc);

-- ---------- user_titles: Já vi / Quero ver / Não me interessa ----------
create table if not exists public.user_titles (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  tmdb_id       int  not null,
  tipo          text not null check (tipo in ('movie', 'tv')),
  status        text not null check (status in ('ja_vi', 'quero_ver', 'nao_interessa')),
  nota          int  check (nota between 1 and 5),
  motivo        text,
  origem        text not null default 'app',  -- 'app' | 'historico' | 'avaliacao_rapida'
  dados         jsonb,                         -- título, pôster etc. para exibir nas listas
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
create index if not exists user_titles_status_idx on public.user_titles (user_id, status, atualizado_em desc);

-- ---------- availability_cache: verificação "está na Netflix BR?" (24h) ----------
create table if not exists public.availability_cache (
  tmdb_id       int  not null,
  tipo          text not null check (tipo in ('movie', 'tv')),
  na_netflix_br boolean not null,
  provedores    jsonb,
  verificado_em timestamptz not null default now(),
  primary key (tmdb_id, tipo)
);

-- ---------- recommendation_cache: último catálogo "Para você" de cada usuário ----------
create table if not exists public.recommendation_cache (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  itens     jsonb not null,
  gerado_em timestamptz not null default now()
);

-- ---------- api_cache: respostas de TMDB/OMDb/IA (evita estourar limites) ----------
create table if not exists public.api_cache (
  chave     text primary key,
  valor     jsonb,
  expira_em timestamptz not null
);
create index if not exists api_cache_expira_idx on public.api_cache (expira_em);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.taste_profiles       enable row level security;
alter table public.quiz_answers         enable row level security;
alter table public.watch_history_import enable row level security;
alter table public.user_titles          enable row level security;
alter table public.recommendation_cache enable row level security;
alter table public.availability_cache   enable row level security; -- sem políticas: só o servidor
alter table public.api_cache            enable row level security; -- sem políticas: só o servidor

drop policy if exists "dono" on public.profiles;
create policy "dono" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "dono" on public.taste_profiles;
create policy "dono" on public.taste_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.quiz_answers;
create policy "dono" on public.quiz_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.watch_history_import;
create policy "dono" on public.watch_history_import
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.user_titles;
create policy "dono" on public.user_titles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.recommendation_cache;
create policy "dono" on public.recommendation_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Permissões de acesso pela API (o RLS acima continua filtrando linha por linha)
grant select, insert, update, delete on
  public.profiles, public.taste_profiles, public.quiz_answers,
  public.watch_history_import, public.user_titles, public.recommendation_cache
  to authenticated;
grant all on public.availability_cache, public.api_cache to service_role;

-- =====================================================================
-- Cria a linha em "profiles" automaticamente quando alguém se cadastra
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários que já existiam antes deste script também ganham um profile
insert into public.profiles (id, nome)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;
