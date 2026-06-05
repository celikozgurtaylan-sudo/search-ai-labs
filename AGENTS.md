# Repository Guidelines

## Product Context

This repository contains an AI Enhanced UX research interview product. The architecture uses React client UIs, Supabase Auth/RLS, Supabase Postgres, Supabase Edge Functions, and server-side OpenAI/LLM calls.

AI Enhanced Mode means a structured research backbone plus live participant-aware probing, a controlled server-side state machine, and comparable reporting outputs. The AI interviewer must not behave like free chat. It must operate as a governed adaptive probing engine inside the `interview-manager` runtime.

## Project Structure & Module Organization

App code lives in `src/`: pages in `src/pages`, reusable UI in `src/components`, workspace panels in `src/components/workspace`, services in `src/services`, shared helpers in `src/lib`, and Supabase client/types in `src/integrations/supabase`. Assets are in `src/assets` and `public`. Backend work lives under `supabase/`, with migrations in `supabase/migrations`, Edge Functions in `supabase/functions`, and shared function modules in `supabase/functions/_shared`.

## AI Enhanced Engineering Rules

- Keep LLM calls server-side only.
- Do not expose OpenAI keys, system prompts, invitation tokens, session tokens, API keys, or sensitive participant data.
- Preserve RLS and existing auth/session boundaries.
- Keep the participant UI simple and task-focused.
- Prefer deterministic policy logic around probabilistic LLM outputs.
- Prefer pure functions for policy, validation, and routing decisions.
- Do not introduce dependencies unless clearly needed.
- Follow existing project conventions.
- Run available lint, build, typecheck, or targeted tests before finalizing changes.

## Adaptive Probe Engine Rules

The agent may only decide to ask one targeted follow-up, move to the next anchor, or end the session. It must preserve comparability across participants.

Default limits: max one follow-up per anchor, max five follow-ups per session, and prefer moving forward when uncertain.

A follow-up must be neutral, short, one question only, non-leading, not repetitive, not sensitive, directly related to the participant answer, and relevant to the current anchor. If LLM generation or validation fails, save the participant answer and move to the next anchor.

## Build, Test, and Development Commands

- `npm run dev`: start the local Vite development server.
- `npm run build`: create a production build in `dist/`.
- `npm run build:dev`: build with Vite development mode.
- `npm run lint`: run ESLint across the repository.
- `npm run preview`: preview the built app locally.

There is no root `npm test` script. For Supabase shared-function tests, run targeted Deno tests such as `deno test supabase/functions/_shared/participant-experience-interviewer.test.ts` when Deno is available.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Component files are PascalCase, for example `ParticipantManager.tsx`; services use camelCase filenames ending in `Service.ts`; tests use `*.test.ts`. Follow existing Tailwind and shadcn/ui patterns before adding new styling primitives. Use two-space indentation and run `npm run lint` before handoff.

## Testing Guidelines

Add tests near the logic they cover, especially for adaptive probe policy, validation fallbacks, invitation flows, interview session state, authentication, and report generation. When automated coverage is limited, include focused manual verification notes.

## Commit & Pull Request Guidelines

Recent commits use short imperative messages, for example `Refresh invitation links on resend` and `Allow resending joined participant invites`. Keep commits focused. Pull requests should include a concise summary, test/build results, linked context, screenshots for UI changes, and notes for any Supabase migration or Edge Function deployment.

## Security & Configuration Tips

Never commit secrets, service-role keys, environment files, raw transcripts, or company-sensitive configuration. Keep local Supabase state such as `supabase/.temp` out of commits. When adding logs, avoid printing invitation links, participant emails, session tokens, prompts, or LLM payloads unless explicitly required for a private debugging flow.
