

## Remove Hardcoded Credentials & Demo Auth Bypass

### Problem
Hardcoded usernames, emails (including a real corporate email), and passwords are shipped in client-side code. A fake auth system bypasses Supabase entirely.

### Plan

**Step 1 — Delete `src/lib/demoAuth.ts`**
Remove entirely. Contains hardcoded credentials and fake session logic.

**Step 2 — Delete `src/lib/demoData.ts`**
Remove entirely. In-memory data layer bypassing RLS.

**Step 3 — Clean `src/contexts/AuthContext.tsx`**
- Remove all demo imports
- Remove `usingDemoAuth` state
- Remove demo branches in `signIn`, `signOut`, and `useEffect`
- Keep only standard Supabase auth flow

**Step 4 — Clean `src/pages/Auth.tsx`**
- Remove the credentials display block (lines 157-160)
- Change label from "Email or Demo Account" to "Email"
- Fix placeholder to just "Enter your email"

**Step 5 — Clean service files (4 files)**
- `src/services/projectService.ts` — Remove all demo imports and branching, keep only Supabase calls
- `src/services/participantService.ts` — Same cleanup
- `src/services/projectReportService.ts` — Remove `isDemoProjectId` import and check
- `src/pages/Workspace.tsx` — Remove `isDemoProjectId` import and usage
- `src/components/workspace/StudyPanel.tsx` — Remove `getCurrentDemoUser` import and usage

**Step 6 — Fix pre-existing build errors**
- `supabase/functions/_shared/project-report.ts` — Add type annotations for `value`, `participant` params; fix Map construction and property access types
- `src/services/presentationService.ts` — Fix `pptx` reference errors and `VAlign` type

### Files affected
| Action | File |
|--------|------|
| Delete | `src/lib/demoAuth.ts` |
| Delete | `src/lib/demoData.ts` |
| Edit | `src/contexts/AuthContext.tsx` |
| Edit | `src/pages/Auth.tsx` |
| Edit | `src/services/projectService.ts` |
| Edit | `src/services/participantService.ts` |
| Edit | `src/services/projectReportService.ts` |
| Edit | `src/pages/Workspace.tsx` |
| Edit | `src/components/workspace/StudyPanel.tsx` |
| Edit | `supabase/functions/_shared/project-report.ts` |
| Edit | `src/services/presentationService.ts` |

