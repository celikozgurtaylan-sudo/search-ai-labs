
# Fix: Participant Cannot Join Study (RLS Blocking Session Creation)

## Problem
When a participant clicks "Araştırmaya Katıl", the error "çalışmaya katılırken hata oluştu" appears because:

1. The participant is **not authenticated** (anonymous user)
2. The `study_sessions` table has RLS that only allows **project owners** to insert sessions
3. The INSERT operation fails with an RLS violation

## Solution
Create a new `SECURITY DEFINER` RPC function that:
1. Validates the invitation token
2. Creates the session on behalf of the participant
3. Returns the session data for redirect

---

## Technical Implementation

### Step 1: Create Database Function
Create a new RPC function `create_session_for_participant`:

```sql
CREATE OR REPLACE FUNCTION public.create_session_for_participant(
    token_input text,
    session_token_input text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    participant_record RECORD;
    new_session RECORD;
BEGIN
    -- Validate the invitation token and get participant
    SELECT * INTO participant_record
    FROM public.study_participants
    WHERE invitation_token = token_input
    AND (token_expires_at IS NULL OR token_expires_at > now());

    IF participant_record IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Invalid or expired token');
    END IF;

    -- Create the session
    INSERT INTO public.study_sessions (
        project_id,
        participant_id,
        session_token,
        status,
        started_at,
        metadata
    ) VALUES (
        participant_record.project_id,
        participant_record.id,
        session_token_input,
        'active',
        now(),
        '{}'::jsonb
    )
    RETURNING * INTO new_session;

    RETURN json_build_object(
        'success', true,
        'message', 'Session created successfully',
        'session_data', row_to_json(new_session)
    );
END;
$$;
```

### Step 2: Update participantService.ts
Modify `createSessionForParticipant` to use the new RPC function:

```typescript
async createSessionForParticipant(projectId: string, participantId: string, invitationToken: string): Promise<StudySession> {
  const sessionToken = this.generateSessionToken();
  
  const { data, error } = await supabase
    .rpc('create_session_for_participant', {
      token_input: invitationToken,
      session_token_input: sessionToken
    })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  const result = data as { success?: boolean; message?: string; session_data?: unknown } | null;

  if (!result || !result.success) {
    throw new Error(result?.message || 'Failed to create session');
  }

  return result.session_data as StudySession;
}
```

### Step 3: Update ParticipantLanding.tsx
Pass the invitation token to the session creation:

```typescript
const session = await participantService.createSessionForParticipant(
  participant.project_id,
  participant.id!,
  participant.invitation_token  // Add this parameter
);
```

---

## Files to Modify
| File | Change |
|------|--------|
| **Database** | New RPC function `create_session_for_participant` |
| `src/services/participantService.ts` | Update `createSessionForParticipant` to use RPC |
| `src/pages/ParticipantLanding.tsx` | Pass invitation token to session creation |

## Security Considerations
- The RPC function uses `SECURITY DEFINER` to bypass RLS
- It validates the token before creating the session
- Only valid, non-expired tokens can create sessions
- This follows the same pattern as `update_participant_status_by_token`
