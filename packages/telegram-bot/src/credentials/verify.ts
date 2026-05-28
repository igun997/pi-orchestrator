export interface VerifyResult {
  ok: boolean;
  models?: string[];
  error?: string;
  accountName?: string;
}

/**
 * Verify provider API key by making a minimal test call.
 */
export async function verifyProvider(name: string, apiKey: string): Promise<VerifyResult> {
  try {
    switch (name.toLowerCase()) {
      case "anthropic":
        return await verifyAnthropic(apiKey);
      case "openai":
        return await verifyOpenAI(apiKey);
      case "google":
        return await verifyGoogle(apiKey);
      case "groq":
        return await verifyGroq(apiKey);
      default:
        return await verifyOpenAICompatible(name, apiKey);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function verifyAnthropic(apiKey: string): Promise<VerifyResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
  if (res.status === 403) return { ok: false, error: "Forbidden (403) — check permissions" };

  // Any 2xx or 4xx (except auth) means key is valid
  const models = ["claude-sonnet-4-20250514", "claude-haiku-4-20250514", "claude-opus-4-20250514"];
  return { ok: true, models };
}

async function verifyOpenAI(apiKey: string): Promise<VerifyResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

  const data = (await res.json()) as { data?: Array<{ id: string }> };
  const models = data.data?.map((m) => m.id).filter((id) => id.startsWith("gpt-")) ?? [];
  return { ok: true, models: models.slice(0, 10) };
}

async function verifyGoogle(apiKey: string): Promise<VerifyResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

  if (res.status === 400 || res.status === 403) return { ok: false, error: "Invalid API key" };
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

  const data = (await res.json()) as { models?: Array<{ name: string }> };
  const models = data.models?.map((m) => m.name.replace("models/", "")).filter((n) => n.includes("gemini")) ?? [];
  return { ok: true, models: models.slice(0, 10) };
}

async function verifyGroq(apiKey: string): Promise<VerifyResult> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

  const data = (await res.json()) as { data?: Array<{ id: string }> };
  const models = data.data?.map((m) => m.id) ?? [];
  return { ok: true, models: models.slice(0, 10) };
}

async function verifyOpenAICompatible(_name: string, apiKey: string): Promise<VerifyResult> {
  // Generic: assume key is valid if non-empty
  if (apiKey.length < 10) return { ok: false, error: "API key too short" };
  return { ok: true, models: [] };
}

/**
 * Verify Cloudflare credentials.
 */
export async function verifyCloudflare(apiToken: string, accountId: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Invalid token or insufficient permissions" };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const data = (await res.json()) as { result?: Array<{ id: string }>; result_info?: { count: number } };
    const count = data.result?.length ?? 0;
    return { ok: true, accountName: `${count} worker(s) found` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
