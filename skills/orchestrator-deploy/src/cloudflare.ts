export interface CloudflareAdapter {
  hasWorker(name: string): Promise<boolean>;
  createWorker(name: string): Promise<void>;
  listSecretNames(worker: string): Promise<string[]>;
  putSecret(worker: string, key: string, value: string): Promise<void>;
  deploy(worker: string, distDir: string): Promise<{ url: string }>;
}

export class MockCloudflareAdapter implements CloudflareAdapter {
  calls: { method: string; args: unknown[] }[] = [];

  async hasWorker(name: string): Promise<boolean> {
    this.calls.push({ method: "hasWorker", args: [name] });
    return false;
  }

  async createWorker(name: string): Promise<void> {
    this.calls.push({ method: "createWorker", args: [name] });
  }

  async listSecretNames(worker: string): Promise<string[]> {
    this.calls.push({ method: "listSecretNames", args: [worker] });
    return [];
  }

  async putSecret(worker: string, key: string, value: string): Promise<void> {
    this.calls.push({ method: "putSecret", args: [worker, key, value] });
  }

  async deploy(worker: string, distDir: string): Promise<{ url: string }> {
    this.calls.push({ method: "deploy", args: [worker, distDir] });
    return { url: `https://${worker}.workers.dev` };
  }
}

export async function ensureWorker(adapter: CloudflareAdapter, name: string): Promise<void> {
  const exists = await adapter.hasWorker(name);
  if (!exists) await adapter.createWorker(name);
}

export async function ensureSecrets(adapter: CloudflareAdapter, worker: string, secrets: Record<string, string>): Promise<void> {
  const existing = new Set(await adapter.listSecretNames(worker));
  for (const [key, value] of Object.entries(secrets)) {
    if (!existing.has(key)) await adapter.putSecret(worker, key, value);
  }
}

export async function deployAlways(adapter: CloudflareAdapter, worker: string, distDir: string): Promise<{ url: string }> {
  return adapter.deploy(worker, distDir);
}
