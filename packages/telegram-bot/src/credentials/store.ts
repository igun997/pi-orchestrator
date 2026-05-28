import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(botToken: string, adminId: number): Buffer {
  const salt = `pi-orchestrator:${adminId}`;
  return scryptSync(botToken, salt, KEY_LENGTH);
}

function encrypt(data: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(encoded: string, key: Buffer): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

export interface ProviderCredential {
  name: string;
  apiKey: string;
  verified: boolean;
  addedAt: string;
}

export interface DeployCredential {
  apiToken: string;
  accountId: string;
  verified: boolean;
  addedAt: string;
}

export interface ModelConfig {
  enabled: string[];
  disabled: string[];
  default: string;
}

export class CredentialStore {
  private key: Buffer;
  private configDir: string;

  constructor(dataDir: string, botToken: string, adminId: number) {
    this.key = deriveKey(botToken, adminId);
    this.configDir = join(dataDir, "config");
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.configDir, { recursive: true });
  }

  // --- Providers ---

  async getProviders(): Promise<ProviderCredential[]> {
    const filePath = join(this.configDir, "providers.enc.json");
    if (!existsSync(filePath)) return [];
    const raw = await readFile(filePath, "utf8");
    const decrypted = decrypt(raw, this.key);
    return JSON.parse(decrypted) as ProviderCredential[];
  }

  async saveProviders(providers: ProviderCredential[]): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.configDir, "providers.enc.json");
    const encrypted = encrypt(JSON.stringify(providers), this.key);
    await writeFile(filePath, encrypted, "utf8");
  }

  async addProvider(name: string, apiKey: string): Promise<void> {
    const providers = await this.getProviders();
    const existing = providers.findIndex((p) => p.name === name);
    const entry: ProviderCredential = { name, apiKey, verified: true, addedAt: new Date().toISOString() };
    if (existing >= 0) {
      providers[existing] = entry;
    } else {
      providers.push(entry);
    }
    await this.saveProviders(providers);
  }

  async removeProvider(name: string): Promise<boolean> {
    const providers = await this.getProviders();
    const idx = providers.findIndex((p) => p.name === name);
    if (idx === -1) return false;
    providers.splice(idx, 1);
    await this.saveProviders(providers);
    return true;
  }

  async getProvider(name: string): Promise<ProviderCredential | undefined> {
    const providers = await this.getProviders();
    return providers.find((p) => p.name === name);
  }

  // --- Deploy credentials ---

  async getDeployCredentials(): Promise<DeployCredential | undefined> {
    const filePath = join(this.configDir, "deploy.enc.json");
    if (!existsSync(filePath)) return undefined;
    const raw = await readFile(filePath, "utf8");
    const decrypted = decrypt(raw, this.key);
    return JSON.parse(decrypted) as DeployCredential;
  }

  async saveDeployCredentials(creds: DeployCredential): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.configDir, "deploy.enc.json");
    const encrypted = encrypt(JSON.stringify(creds), this.key);
    await writeFile(filePath, encrypted, "utf8");
  }

  // --- Model config ---

  async getModelConfig(): Promise<ModelConfig> {
    const filePath = join(this.configDir, "models.json");
    if (!existsSync(filePath)) return { enabled: [], disabled: [], default: "" };
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ModelConfig;
  }

  async saveModelConfig(config: ModelConfig): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.configDir, "models.json");
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
  }

  async enableModel(model: string): Promise<void> {
    const config = await this.getModelConfig();
    if (!config.enabled.includes(model)) config.enabled.push(model);
    config.disabled = config.disabled.filter((m) => m !== model);
    await this.saveModelConfig(config);
  }

  async disableModel(model: string): Promise<void> {
    const config = await this.getModelConfig();
    config.enabled = config.enabled.filter((m) => m !== model);
    if (!config.disabled.includes(model)) config.disabled.push(model);
    if (config.default === model) config.default = config.enabled[0] ?? "";
    await this.saveModelConfig(config);
  }

  async setDefaultModel(model: string): Promise<void> {
    const config = await this.getModelConfig();
    if (!config.enabled.includes(model)) config.enabled.push(model);
    config.default = model;
    await this.saveModelConfig(config);
  }
}
