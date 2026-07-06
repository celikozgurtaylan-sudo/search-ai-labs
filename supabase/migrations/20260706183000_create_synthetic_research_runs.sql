create table if not exists public.synthetic_research_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  persona_count integer not null default 0,
  question_count integer not null default 0,
  response_count integer not null default 0,
  report jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.synthetic_research_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.synthetic_research_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id text not null,
  persona_snapshot jsonb not null default '{}'::jsonb,
  question_ref text not null,
  section text not null,
  question_text text not null,
  response_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists synthetic_research_runs_project_idx
  on public.synthetic_research_runs(project_id, created_at desc);

create index if not exists synthetic_research_responses_run_idx
  on public.synthetic_research_responses(run_id, created_at asc);

alter table public.synthetic_research_runs enable row level security;
alter table public.synthetic_research_responses enable row level security;

create policy "Users can view their own synthetic research runs"
on public.synthetic_research_runs
for select
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_research_runs.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can create their own synthetic research runs"
on public.synthetic_research_runs
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_research_runs.project_id
      and projects.user_id = auth.uid()
  )
  and user_id = auth.uid()
);

create policy "Users can update their own synthetic research runs"
on public.synthetic_research_runs
for update
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_research_runs.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can view their own synthetic research responses"
on public.synthetic_research_responses
for select
using (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_research_responses.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can create their own synthetic research responses"
on public.synthetic_research_responses
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = synthetic_research_responses.project_id
      and projects.user_id = auth.uid()
  )
  and user_id = auth.uid()
);
