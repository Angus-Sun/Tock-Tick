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
  created_at timestamp default now()
);