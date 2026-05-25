import { describe, expect, it } from "vitest";
import { MockCloudflareAdapter, ensureWorker, ensureSecrets, deployAlways } from "./cloudflare.js";

describe("CloudflareAdapter helpers", () => {
  it("ensureWorker creates when not exists", async () => {
    const adapter = new MockCloudflareAdapter();
    await ensureWorker(adapter, "my-site");
    expect(adapter.calls).toContainEqual({ method: "hasWorker", args: ["my-site"] });
    expect(adapter.calls).toContainEqual({ method: "createWorker", args: ["my-site"] });
  });

  it("ensureSecrets pushes missing keys", async () => {
    const adapter = new MockCloudflareAdapter();
    await ensureSecrets(adapter, "my-site", { SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "key123" });
    expect(adapter.calls.filter((c) => c.method === "putSecret")).toHaveLength(2);
  });

  it("deployAlways always calls deploy", async () => {
    const adapter = new MockCloudflareAdapter();
    const result = await deployAlways(adapter, "my-site", "dist/");
    expect(result.url).toContain("my-site.workers.dev");
    expect(adapter.calls).toContainEqual({ method: "deploy", args: ["my-site", "dist/"] });
  });
});
