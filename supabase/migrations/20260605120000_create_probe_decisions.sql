create table if not exists public.probe_decisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  participant_id uuid not null references public.study_participants(id) on delete cascade,
  anchor_question_id uuid references public.interview_questions(id) on delete set null,
  response_id uuid not null references public.interview_responses(id) on delete cascade,
  decision text not null,
  gap_type text,
  probe_type text,
  decision_reason text,
  relevance_score numeric(4,3),
  research_value_score numeric(4,3),
  answer_sufficiency_score numeric(4,3),
  risk_score numeric(4,3),
  confidence_score numeric(4,3),
  generated_question text,
  validator_status text,
  validator_notes text,
  prompt_version text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists probe_decisions_session_created_idx
  on public.probe_decisions(session_id, created_at desc);

create index if not exists probe_decisions_response_idx
  on public.probe_decisions(response_id);

create index if not exists probe_decisions_participant_idx
  on public.probe_decisions(participant_id, created_at desc);

alter table public.probe_decisions enable row level security;

drop policy if exists "Project owners can view probe decisions" on public.probe_decisions;
create policy "Project owners can view probe decisions"
on public.probe_decisions
for select
using (
  exists (
    select 1
    from public.study_sessions ss
    join public.projects p on p.id = ss.project_id
    where ss.id = probe_decisions.session_id
      and p.user_id = auth.uid()
  )
);
