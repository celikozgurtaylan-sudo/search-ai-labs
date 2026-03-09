

# Update Lovable AI Gateway models to `openai/gpt-5.2` + Fix build error

## Build Error Fix
**File**: `supabase/functions/speech-to-text/index.ts` (line 89)
- Fix `error.message` → `(error instanceof Error ? error.message : 'Unknown error')`
- This file uses OpenAI's API directly (`api.openai.com`), so its model stays unchanged.

## Model Updates (Lovable AI Gateway only)

These files call `ai.gateway.lovable.dev` and will be updated to `openai/gpt-5.2`:

| File | Current Model | Lines |
|------|--------------|-------|
| `generate-questions/index.ts` | `google/gemini-2.5-flash` (×2) | 86, 127 |
| `analyze-project/index.ts` | `google/gemini-2.5-flash` | 25 |
| `interview-analysis/index.ts` | `google/gemini-2.5-pro` | 150 |

## Not Changed
| File | Reason |
|------|--------|
| `speech-to-text/index.ts` | Uses `api.openai.com` directly (Whisper), not Lovable gateway |
| `turkish-tts/index.ts` | TTS model, not a chat model |
| `turkish-chat/index.ts` | Need to verify if it uses Lovable gateway |

**Note**: I'll check `turkish-chat/index.ts` before implementing to confirm whether it uses the Lovable gateway.

