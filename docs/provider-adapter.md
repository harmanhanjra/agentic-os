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

## NVIDIA NIM

NVIDIA's hosted NIM endpoint is OpenAI-compatible:

```env
NVIDIA_API_KEY=...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```

The registry must use model ids returned by NVIDIA's `/v1/models` endpoint. Model availability changes, so use **Test connection** and refresh the registry rather than assuming a model is still available. ScaleOS now returns provider status/model errors instead of collapsing them into a generic 502. NVIDIA reasoning streams may use `reasoning_content`; the chat client handles both reasoning and content deltas.

## Higgsfield media provider

Higgsfield is intentionally modeled as a media provider, not a text chat provider. The official GitHub SDK documents:

- API host: `https://api.higgsfield.ai`
- credentials: `HF_KEY` as `api-key:api-secret`, or separate `HF_API_KEY` and `HF_API_SECRET`
- generation: submit an application such as `bytedance/seedream/v4/text-to-image`, then poll the returned request status URL
- authentication header: `Authorization: Key <credential>`

ScaleOS exposes the first server-side boundary at `POST /api/images/generate`; media jobs should be persisted and polled before the Image Studio claims completion.

Sources:
- https://github.com/higgsfield-ai/higgsfield-client
- https://docs.higgsfield.ai/docs/llms.txt

Hosted deployments must reject private custom URLs by default. Local endpoints are supported only when ScaleOS itself runs in a trusted local architecture or a future Local Bridge is enabled.
