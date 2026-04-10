create table if not exists public.question_edit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  research_mode text not null,
  section_title text,
  section_index integer,
  original_question_text text not null,
  edited_question_text text not null,
  edit_source text not null default 'manual_edit',
  original_quality_status text not null,
  edited_quality_status text not null,
  original_issues jsonb not null default '[]'::jsonb,
  edited_issues jsonb not null default '[]'::jsonb,
  diff_summary text
);

create index if not exists question_edit_events_project_id_idx
  on public.question_edit_events(project_id, created_at desc);

create index if not exists question_edit_events_mode_idx
  on public.question_edit_events(research_mode, created_at desc);

create table if not exists public.question_learning_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pattern_key text not null unique,
  pattern_type text not null,
  applies_to_mode text not null,
  section_kind text not null default 'any',
  trigger_phrases jsonb not null default '[]'::jsonb,
  avoid_phrases jsonb not null default '[]'::jsonb,
  preferred_phrases jsonb not null default '[]'::jsonb,
  bad_example text,
  better_example text,
  confidence_score numeric(4,3) not null default 0.250,
  usage_count integer not null default 1,
  last_seen_at timestamptz not null default now()
);

create index if not exists question_learning_memory_mode_idx
  on public.question_learning_memory(applies_to_mode, section_kind, confidence_score desc, usage_count desc);

create or replace function public.set_question_learning_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_question_learning_memory_updated_at on public.question_learning_memory;
create trigger set_question_learning_memory_updated_at
before update on public.question_learning_memory
for each row
execute function public.set_question_learning_memory_updated_at();

alter table public.question_edit_events enable row level security;
alter table public.question_learning_memory enable row level security;
