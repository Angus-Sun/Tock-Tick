-- User profiles table
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Enable Row Level Security on profiles
alter table profiles enable row level security;

-- Create policy to allow users to read and update their own profile
create policy "Users can view their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

-- Function to generate random 6-digit number for username
create or replace function generate_random_username()
returns text
language plpgsql
as $$
begin
  return 'user' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
end;
$$;

-- Function to handle new user signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_username text;
  username_exists boolean;
begin
  -- Generate a unique username
  loop
    new_username := generate_random_username();
    
    -- Check if username already exists
    select exists(select 1 from profiles where username = new_username) into username_exists;
    
    -- Exit loop if username is unique
    exit when not username_exists;
  end loop;
  
  -- Insert the new profile
  insert into profiles (id, username, created_at, updated_at)
  values (new.id, new_username, now(), now());
  
  return new;
end;
$$;

-- Trigger to automatically create profile when user signs up
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Challenge videos
create table challenges (
  id uuid primary key default gen_random_uuid(),
  title text,
  uploader text,
  uploader_id uuid references profiles(id),
  video_url text,
  created_at timestamp default now()
);

-- Player scores
create table scores (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id),
  player text,
  player_id uuid references profiles(id),
  score float,
  mimic_url text,
  created_at timestamp default now(),
  -- Extended scoring data
  accuracy_score float,
  consistency_score float,
  timing_score float,
  style_score float,
  difficulty_level text default 'BEGINNER',
  difficulty_multiplier float default 1.0,
  total_steps integer,
  valid_steps integer,
  pp_earned integer default 0,
  is_personal_best boolean default false
);

-- User statistics and performance tracking
create table user_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) unique,
  total_pp integer default 0,
  total_plays integer default 0,
  total_challenges_completed integer default 0,
  current_streak integer default 0,
  best_streak integer default 0,
  average_score float default 0,
  rank_tier text default 'NOVICE',
  last_play_date timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Global leaderboard for top performers
create table global_leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  username text,
  total_pp integer default 0,
  rank_position integer,
  rank_tier text,
  recent_activity jsonb, -- Store recent scores/achievements
  last_updated timestamp default now(),
  unique(user_id)
);

-- Performance points history for detailed tracking
create table pp_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  score_id uuid references scores(id),
  challenge_id uuid references challenges(id),
  pp_earned integer,
  pp_breakdown jsonb, -- Store detailed PP calculation
  previous_total_pp integer,
  new_total_pp integer,
  rank_change integer default 0,
  created_at timestamp default now()
);

-- Challenge difficulty and metadata
create table challenge_metadata (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id) unique,
  difficulty_level text default 'BEGINNER',
  average_score float,
  total_attempts integer default 0,
  total_completions integer default 0,
  top_score float,
  movement_complexity float,
  estimated_duration float,
  tags text[],
  updated_at timestamp default now()
);

-- Enable RLS on new tables
alter table user_stats enable row level security;
alter table global_leaderboard enable row level security;
alter table pp_history enable row level security;
alter table challenge_metadata enable row level security;

-- Policies for user_stats
create policy "Users can view their own stats" on user_stats
  for select using (auth.uid() = user_id);

create policy "Users can update their own stats" on user_stats
  for update using (auth.uid() = user_id);

create policy "Users can insert their own stats" on user_stats
  for insert with check (auth.uid() = user_id);

-- Policies for global_leaderboard (public read)
create policy "Anyone can view global leaderboard" on global_leaderboard
  for select using (true);

create policy "System can update global leaderboard" on global_leaderboard
  for all using (true); -- This would be restricted to service role in production

-- Policies for pp_history
create policy "Users can view their own PP history" on pp_history
  for select using (auth.uid() = user_id);

-- Policies for challenge_metadata (public read)
create policy "Anyone can view challenge metadata" on challenge_metadata
  for select using (true);

-- Function to update user stats after score submission
create or replace function update_user_stats_on_score_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_current_stats record;
  new_total_pp integer;
  new_avg_score float;
  streak_update integer;
  rank_tier text;
begin
  -- Get current user stats
  select * into user_current_stats 
  from user_stats 
  where user_id = new.player_id;

  -- If no stats record exists, create one
  if user_current_stats is null then
    insert into user_stats (
      user_id, 
      total_pp, 
      total_plays, 
      total_challenges_completed,
      current_streak,
      best_streak,
      average_score,
      last_play_date
    ) values (
      new.player_id,
      new.pp_earned,
      1,
      1,
      case when new.score >= 70 then 1 else 0 end,
      case when new.score >= 70 then 1 else 0 end,
      new.score,
      now()
    );
  else
    -- Calculate new totals
    new_total_pp := user_current_stats.total_pp + new.pp_earned;
    new_avg_score := (user_current_stats.average_score * user_current_stats.total_plays + new.score) / (user_current_stats.total_plays + 1);
    
    -- Update streak logic
    if new.score >= 70 then -- Good performance threshold
      streak_update := user_current_stats.current_streak + 1;
    else
      streak_update := 0;
    end if;

    -- Determine rank tier based on total PP
    if new_total_pp >= 10000 then rank_tier := 'LEGEND';
    elsif new_total_pp >= 7500 then rank_tier := 'MASTER';
    elsif new_total_pp >= 5000 then rank_tier := 'EXPERT';
    elsif new_total_pp >= 2500 then rank_tier := 'ADVANCED';
    elsif new_total_pp >= 1000 then rank_tier := 'INTERMEDIATE';
    elsif new_total_pp >= 250 then rank_tier := 'BEGINNER';
    else rank_tier := 'NOVICE';
    end if;

    -- Update user stats
    update user_stats set
      total_pp = new_total_pp,
      total_plays = total_plays + 1,
      total_challenges_completed = case when new.score > 0 then total_challenges_completed + 1 else total_challenges_completed end,
      current_streak = streak_update,
      best_streak = greatest(best_streak, streak_update),
      average_score = new_avg_score,
      rank_tier = rank_tier,
      last_play_date = now(),
      updated_at = now()
    where user_id = new.player_id;
  end if;

  return new;
end;
$$;

-- Trigger to update user stats when new score is inserted
create trigger on_score_insert_update_stats
  after insert on scores
  for each row execute procedure update_user_stats_on_score_insert();

-- Function to update global leaderboard
create or replace function update_global_leaderboard()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Clear and rebuild global leaderboard
  delete from global_leaderboard;
  
  insert into global_leaderboard (user_id, username, total_pp, rank_position, rank_tier, recent_activity, last_updated)
  select 
    us.user_id,
    p.username,
    us.total_pp,
    row_number() over (order by us.total_pp desc, us.average_score desc, us.last_play_date desc),
    us.rank_tier,
    jsonb_build_object(
      'recent_scores', (
        select jsonb_agg(
          jsonb_build_object(
            'score', s.score,
            'challenge_title', c.title,
            'pp_earned', s.pp_earned,
            'date', s.created_at
          )
        )
        from (
          select s.score, s.pp_earned, s.created_at, c.title
          from scores s
          join challenges c on c.id = s.challenge_id
          where s.player_id = us.user_id
          order by s.created_at desc
          limit 5
        ) s
      ),
      'achievements', jsonb_build_array(
        case when us.best_streak >= 10 then 'Streak Master' end,
        case when us.total_pp >= 5000 then 'High Scorer' end,
        case when us.average_score >= 85 then 'Consistent Performer' end
      )
    ),
    now()
  from user_stats us
  join profiles p on p.id = us.user_id
  where us.total_pp > 0
  order by us.total_pp desc, us.average_score desc, us.last_play_date desc
  limit 100; -- Top 100 players
end;
$$;

-- Function to get user rank and percentile
create or replace function get_user_rank(user_uuid uuid)
returns table(rank_position integer, total_players integer, percentile numeric)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  with ranked_users as (
    select 
      user_id,
      total_pp,
      row_number() over (order by total_pp desc, average_score desc, last_play_date desc) as position
    from user_stats
    where total_pp > 0
  ),
  user_position as (
    select position
    from ranked_users
    where user_id = user_uuid
  ),
  total_count as (
    select count(*) as total
    from ranked_users
  )
  select 
    coalesce(up.position, (select total from total_count) + 1)::integer as rank_position,
    (select total from total_count)::integer as total_players,
    case 
      when up.position is null then 0::numeric
      else round(((select total from total_count)::numeric - up.position + 1) / (select total from total_count)::numeric * 100, 1)
    end as percentile
  from user_position up, total_count tc;
end;
$$;