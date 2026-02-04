

# Create Study Participant with Custom Token

## Overview
You want to create a study participant record in the database using the specific invitation token:
`22af0f08eeee1f36bb4ef1940993e169e6cafb0c89f8c1f5f061acf3efbc6ec9`

## Current Situation
- **Project available**: `f35f3068-bde5-4e65-b3a2-8e2cd1449793` ("Kullanıcı Deneyimi Araştırma Çalışması")
- **Token**: `22af0f08eeee1f36bb4ef1940993e169e6cafb0c89f8c1f5f061acf3efbc6ec9`
- The token does not currently exist in the `study_participants` table

## Implementation

### Option 1: Via Supabase SQL Editor (Manual)
Run this SQL in the [Supabase SQL Editor](https://supabase.com/dashboard/project/ueucxoyvktdnmxkxxbvd/sql/new):

```sql
INSERT INTO study_participants (
  project_id,
  email,
  name,
  status,
  invitation_token,
  token_expires_at,
  invited_at
) VALUES (
  'f35f3068-bde5-4e65-b3a2-8e2cd1449793',
  'test@example.com',  -- Replace with actual email
  'Test Participant',  -- Replace with actual name (optional)
  'invited',
  '22af0f08eeee1f36bb4ef1940993e169e6cafb0c89f8c1f5f061acf3efbc6ec9',
  NOW() + INTERVAL '7 days',
  NOW()
);
```

### Option 2: Via UI (Invitation Panel)
1. Open the Workspace page
2. Open the Invitation Panel (Katılımcı Davet Et)
3. Add a participant with email - this will auto-generate a token

### Result
Once created, participants can access the study via:
**`https://beta.searcho.online/join/research/22af0f08eeee1f36bb4ef1940993e169e6cafb0c89f8c1f5f061acf3efbc6ec9`**

---

## Technical Details

### Database Table: `study_participants`
| Column | Value |
|--------|-------|
| `project_id` | `f35f3068-bde5-4e65-b3a2-8e2cd1449793` |
| `email` | (required - you need to specify) |
| `invitation_token` | `22af0f08eeee1f36bb4ef1940993e169e6cafb0c89f8c1f5f061acf3efbc6ec9` |
| `status` | `invited` |
| `token_expires_at` | 7 days from now |

### RLS Considerations
- Direct SQL inserts via Supabase SQL Editor bypass RLS
- The RPC function `validate_participant_token` is used for public token validation (already configured)

