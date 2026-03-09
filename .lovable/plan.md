

# Update FRONTEND_URL to beta.searcho.online

## Problem
The invitation email links should use `beta.searcho.online` as the domain, not `searcho.lovable.app`.

## Solution
Update the `FRONTEND_URL` secret and harden the edge function code to prevent whitespace issues.

---

## Implementation

### Step 1: Update the Secret
Update the `FRONTEND_URL` secret to:
- **Value**: `https://beta.searcho.online` (no trailing whitespace)

### Step 2: Fix Whitespace Issue in Edge Function
The logs showed trailing spaces were causing malformed URLs. Add `.trim()` to prevent this:

**File**: `supabase/functions/send-invitation-email/index.ts`
**Line 33**: Change from:
```typescript
const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://beta.searcho.online';
```
To:
```typescript
const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'https://beta.searcho.online').trim();
```

### Step 3: Redeploy Edge Function
Redeploy `send-invitation-email` to apply both changes.

### Step 4: Resend Invitation
Send a new invitation to verify the link works correctly.

---

## Expected Result
After this fix, invitation emails will contain working links:
`https://beta.searcho.online/join/research/user-study-xxxxx`

---

## Files to Modify

| File | Change |
|------|--------|
| **Secret: FRONTEND_URL** | Set to `https://beta.searcho.online` |
| `supabase/functions/send-invitation-email/index.ts` | Add `.trim()` on line 33 |

