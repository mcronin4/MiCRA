# Gemini API Key Rotation Setup

This backend can rotate across up to five Gemini API keys for Gemini API-key based calls. That includes MicrAI planning, text generation, image generation, and Veo when Veo is using Gemini API-key auth instead of Vertex service-account auth.

## Required Env Vars

Add these variables to the backend environment in Railway/prod:

```dotenv
GEMINI_API_KEY_1=your_first_project_key
GEMINI_API_KEY_2=your_second_project_key
GEMINI_API_KEY_3=your_third_project_key
GEMINI_API_KEY_4=your_fourth_project_key
GEMINI_API_KEY_5=your_fifth_project_key
GEMINI_ROTATION_MAX_WAIT_SECONDS=60
```

## Important Rules

- Use keys from separate Google projects/accounts if you want quota spreading to work.
- Do not point all five env vars at the same project key. That does not create five independent quota buckets.
- `GEMINI_ROTATION_MAX_WAIT_SECONDS` is optional. If omitted, the backend defaults to `60`.
- Local development can still use the legacy fallback:

```dotenv
GEMINI_API_KEY=your_single_local_dev_key
```

The legacy `GEMINI_API_KEY` is only used when no numbered keys are configured.

## Veo Auth Behavior

- If `GOOGLE_APPLICATION_CREDENTIALS` is set, Veo uses Vertex AI auth and does not use Gemini API key rotation.
- If `GOOGLE_APPLICATION_CREDENTIALS` is not set, Veo uses the shared Gemini API key rotation pool.

## Expected Behavior

- Requests spread across the configured keys in round-robin order.
- If one key hits `RESOURCE_EXHAUSTED` or quota exhaustion, the backend retries on the next available key automatically.
- If all configured keys are cooling down, the backend waits up to `GEMINI_ROTATION_MAX_WAIT_SECONDS`.
- If all keys are still unavailable after that window, the user sees a short friendly rate-limit message instead of the raw Gemini quota payload.
