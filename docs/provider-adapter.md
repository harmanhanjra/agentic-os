# Adding a Provider Adapter

1. Add a provider id and server-only configuration schema.
2. Implement `ProviderAdapter` from `lib/ai/types.ts`.
3. Normalize discovered provider models into `AIModel` records. Never hard-code model names in UI code.
4. Declare capabilities explicitly and return `null` cost metadata when the provider does not publish pricing.
5. Implement `testConnection` with bounded timeouts and normalized `ProviderHealth` results.
6. Keep image/audio/video generation methods separate from text generation.
7. Store credentials encrypted; never return keys or log request secrets.
8. Add unit tests for normalization, capability matching, error translation, and credential isolation.
9. Add the adapter to the server-side provider resolver and document required environment variables.

Hosted deployments must reject private custom URLs by default. Local endpoints are supported only when ScaleOS itself runs in a trusted local architecture or a future Local Bridge is enabled.
