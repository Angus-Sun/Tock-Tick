
create extension if not exists pgcrypto;

-- user_stats: aggregated PP and activity per user
create table if not exists public.user_stats (
  user_id uuid primary key,
  display_name text,
  total_pp integer default 0,
  total_plays integer default 0,
  current_streak integer default 0,
  last_played timestamp without time zone,
  updated_at timestamp without time zone default now()
);

-- pp_history: record each PP award
create table if not exists public.pp_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  score_id uuid,
  challenge_id uuid,
  pp_earned integer not null default 0,
  pp_breakdown jsonb,
  previous_total_pp integer default 0,
  new_total_pp integer default 0,
  created_at timestamp without time zone default now()
);

-- global_leaderboard: denormalized leaderboard for fast reads
create table if not exists public.global_leaderboard (
  user_id uuid primary key,
  username text,
  total_pp integer default 0,
  rank_position integer,
  rank_tier text,
  recent_activity jsonb,
  last_updated timestamp without time zone default now()
);

-- Function: update_global_leaderboard
-- This ranks users by total_pp and upserts into global_leaderboard
create or replace function public.update_global_leaderboard()
returns void
language plpgsql
as $$
begin
  -- Upsert ranked rows into global_leaderboard
  with ranked as (
    select
      user_id,
      display_name as username,
      total_pp,
      row_number() over (order by total_pp desc nulls last) as rank_position,
      case
        when total_pp >= 10000 then 'LEGEND'
        when total_pp >= 7500 then 'MASTER'
        when total_pp >= 5000 then 'EXPERT'
        when total_pp >= 2500 then 'ADVANCED'
        when total_pp >= 1000 then 'BEGINNER'
        when total_pp >= 250 then 'INTERMEDIATE'
        else 'NOVICE'
      end as rank_tier
    from public.user_stats
  )
  insert into public.global_leaderboard (user_id, username, total_pp, rank_position, rank_tier, last_updated)
  select user_id, username, total_pp, rank_position, rank_tier, now() from ranked
  on conflict (user_id) do update
    set username = excluded.username,
        total_pp = excluded.total_pp,
        rank_position = excluded.rank_position,
        rank_tier = excluded.rank_tier,
        last_updated = excluded.last_updated;
end;
$$;

-- Function: get_user_rank(user_uuid)
-- Returns the rank_position, percentile and total_players for a given user
create or replace function public.get_user_rank(user_uuid uuid)
returns table(rank_position int, percentile int, total_players int)
language sql
as $$
  with ranked as (
    select user_id,
           row_number() over (order by total_pp desc nulls last) as rank_position,
           count(*) over () as total_players
    from public.user_stats
  )
  select r.rank_position,
         cast( round(((r.total_players - r.rank_position + 1)::numeric / r.total_players) * 100) as int) as percentile,
         r.total_players
  from ranked r
  where r.user_id = user_uuid;
$$;

create index if not exists idx_user_stats_total_pp on public.user_stats (total_pp desc);
create index if not exists idx_pp_history_user on public.pp_history (user_id);

-- Done
