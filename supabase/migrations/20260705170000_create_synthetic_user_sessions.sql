create table if not exists public.synthetic_user_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id text not null,
  persona_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.synthetic_user_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.synthetic_user_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('researcher', 'synthetic_user')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists synthetic_user_sessions_project_idx
  on public.synthetic_user_sessions(project_id, created_at desc);

create index if not exists synthetic_user_messages_session_idx
  on public.synthetic_user_messages(session_id, created_at asc);

alter table public.synthetic_user_sessions enable row level security;
alter table public.synthetic_user_messages enable row level security;

create policy "Users can view their own synthetic sessions"
on public.synthetic_user_sessions
for select
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_user_sessions.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can create their own synthetic sessions"
on public.synthetic_user_sessions
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_user_sessions.project_id
      and projects.user_id = auth.uid()
  )
  and user_id = auth.uid()
);

create policy "Users can update their own synthetic sessions"
on public.synthetic_user_sessions
for update
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_user_sessions.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can view their own synthetic messages"
on public.synthetic_user_messages
for select
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_user_messages.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can create their own synthetic messages"
on public.synthetic_user_messages
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_user_messages.project_id
      and projects.user_id = auth.uid()
  )
  and user_id = auth.uid()
);

drop trigger if exists update_synthetic_user_sessions_updated_at on public.synthetic_user_sessions;
create trigger update_synthetic_user_sessions_updated_at
  before update on public.synthetic_user_sessions
  for each row
  execute function public.update_updated_at_column();
