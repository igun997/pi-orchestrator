import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface WorkspaceInfo {
  name: string;
  path: string;
  createdAt: string;
}

export interface UserWorkspaceState {
  active: string | null;
  workspaces: WorkspaceInfo[];
}

export class WorkspaceManager {
  private userDir: string;
  private stateFile: string;

  constructor(dataDir: string, telegramId: number) {
    this.userDir = join(dataDir, "users", String(telegramId));
    this.stateFile = join(this.userDir, "workspace-state.json");
  }

  async init(): Promise<void> {
    await mkdir(join(this.userDir, "workspaces"), { recursive: true });
    await mkdir(join(this.userDir, "memory"), { recursive: true });
    await mkdir(join(this.userDir, "sessions"), { recursive: true });
  }

  async getState(): Promise<UserWorkspaceState> {
    if (!existsSync(this.stateFile)) {
      return { active: null, workspaces: [] };
    }
    const raw = await readFile(this.stateFile, "utf8");
    return JSON.parse(raw) as UserWorkspaceState;
  }

  private async saveState(state: UserWorkspaceState): Promise<void> {
    await writeFile(this.stateFile, JSON.stringify(state, null, 2), "utf8");
  }

  async createWorkspace(name: string): Promise<WorkspaceInfo> {
    const state = await this.getState();
    const existing = state.workspaces.find((w) => w.name === name);
    if (existing) throw new Error(`Workspace "${name}" already exists`);

    const wsPath = join(this.userDir, "workspaces", name);
    await mkdir(wsPath, { recursive: true });

    const info: WorkspaceInfo = {
      name,
      path: wsPath,
      createdAt: new Date().toISOString(),
    };

    state.workspaces.push(info);
    state.active = name;
    await this.saveState(state);
    return info;
  }

  async switchWorkspace(name: string): Promise<WorkspaceInfo | undefined> {
    const state = await this.getState();
    const ws = state.workspaces.find((w) => w.name === name);
    if (!ws) return undefined;
    state.active = name;
    await this.saveState(state);
    return ws;
  }

  async getActiveWorkspace(): Promise<WorkspaceInfo | undefined> {
    const state = await this.getState();
    if (!state.active) return undefined;
    return state.workspaces.find((w) => w.name === state.active);
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const state = await this.getState();
    return state.workspaces;
  }

  getMemoryPath(): string {
    return join(this.userDir, "memory");
  }

  getSessionsPath(): string {
    return join(this.userDir, "sessions");
  }

  getUserDir(): string {
    return this.userDir;
  }
}
