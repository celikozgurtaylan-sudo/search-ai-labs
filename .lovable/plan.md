

# Update FRONTEND_URL Secret to Use Working Domain

## Problem
The `FRONTEND_URL` secret is currently set to `https://testsession.searcho.online`, which doesn't have DNS configured. This causes invitation email links to point to an unreachable domain.

## Solution
Update the `FRONTEND_URL` secret to use the published Lovable domain: `https://searcho.lovable.app`

---

## Implementation

### Step 1: Update the Secret
Update the Supabase secret `FRONTEND_URL` from:
- **Current**: `https://testsession.searcho.online` (broken)
- **New**: `https://searcho.lovable.app` (working)

### Step 2: Redeploy Edge Function
After updating the secret, redeploy the `send-invitation-email` edge function to pick up the new value.

### Step 3: Verify
Send a new test invitation email to confirm the links now point to the correct domain.

---

## Result
After this change, invitation emails will generate links like:
`https://searcho.lovable.app/join/research/user-study-ubwv16ge`

Instead of the broken:
`https://testsession.searcho.online/join/research/user-study-ubwv16ge`

---

## Technical Details

### Affected Component
- **Edge Function**: `supabase/functions/send-invitation-email/index.ts`
- **Line 33**: `const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://beta.searcho.online';`

### Note
The existing participant invitation for `taylancelikk@hotmail.com` already has the broken link in their email. You'll need to resend the invitation for them to receive a working link.

