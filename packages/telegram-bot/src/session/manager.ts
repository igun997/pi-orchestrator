import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  AuthStorage,
  type AgentSession,
  type CreateAgentSessionResult,
} from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";

import type { BotConfig } from "../config.js";
import { WorkspaceManager } from "./workspace.js";
import { buildPersona } from "../persona.js";
import type { CredentialStore } from "../credentials/store.js";

export interface SessionCallbacks {
  onTextDelta: (delta: string) => void;
  onToolStart: (toolName: string, toolCallId: string) => void;
  onToolEnd: (toolCallId: string, isError: boolean) => void;
  onAgentEnd: () => void;
}

export interface UserSession {
  session: AgentSession;
  workspace: WorkspaceManager;
  unsubscribe?: () => void;
  prompted?: boolean;
}

/**
 * Manages pi AgentSessions per telegram user.
 * Each user gets their own session scoped to their active workspace.
 */
export class SessionManager {
  private sessions = new Map<number, UserSession>();
  private config: BotConfig;
  private credentials: CredentialStore;

  constructor(config: BotConfig, credentials: CredentialStore) {
    this.config = config;
    this.credentials = credentials;
  }

  private log(...args: any[]): void {
    if (this.config.debug) console.log("[pi-session]", ...args);
  }

  /**
   * Get or create a pi session for a telegram user.
   */
  async getOrCreate(telegramId: number): Promise<UserSession> {
    const existing = this.sessions.get(telegramId);
    if (existing) return existing;

    const ws = new WorkspaceManager(this.config.dataDir, telegramId);
    await ws.init();

    const active = await ws.getActiveWorkspace();
    const cwd = active?.path ?? ws.getUserDir();

    const persona = buildPersona(this.config);

    // Resolve orchestrator paths
    const orchestratorRoot = resolve(import.meta.dirname, "../../../../");
    const extensionPath = join(orchestratorRoot, "extensions/orchestrator/src/index.ts");

    // External extensions (pi-memctx, pi-web-access)
    const agentDir = getAgentDir();
    const memctxPath = join(agentDir, "npm/node_modules/pi-memctx/index.ts");
    const webAccessPath = join(agentDir, "npm/node_modules/pi-web-access/index.ts");

    const extensionPaths = [extensionPath, memctxPath, webAccessPath];

    const skillPaths = [
      join(orchestratorRoot, "skills/orchestrator-interview"),
      join(orchestratorRoot, "skills/orchestrator-extract"),
      join(orchestratorRoot, "skills/orchestrator-context"),
      join(orchestratorRoot, "skills/orchestrator-scaffold"),
      join(orchestratorRoot, "skills/orchestrator-build"),
      join(orchestratorRoot, "skills/orchestrator-deploy"),
      join(orchestratorRoot, "skills/impeccable"),
      join(orchestratorRoot, "skills/motion-design"),
      join(orchestratorRoot, "skills/design-engineering"),
      join(orchestratorRoot, "skills/orchestrator-picsum"),
      // pi-web-access skills
      join(agentDir, "npm/node_modules/pi-web-access/skills"),
    ];

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: extensionPaths,
      additionalSkillPaths: skillPaths,
      systemPrompt: persona.systemPrompt,
    });

    // Create AuthStorage and inject API keys from credential store
    const authStorage = AuthStorage.create(join(getAgentDir(), "auth.json"));
    const providers = await this.credentials.getProviders();
    for (const provider of providers) {
      authStorage.setRuntimeApiKey(provider.name, provider.apiKey);
    }

    const { session } = await createAgentSession({
      cwd,
      resourceLoader,
      authStorage,
    });

    // Patch bash tool with default timeout (120s)
    patchBashTimeout(session);

    const userSession: UserSession = { session, workspace: ws };
    this.sessions.set(telegramId, userSession);
    return userSession;
  }

  /**
   * Subscribe to session events for streaming responses.
   * Unsubscribes any previous subscription first.
   */
  subscribe(telegramId: number, callbacks: SessionCallbacks): () => void {
    const userSession = this.sessions.get(telegramId);
    if (!userSession) return () => {};

    // Unsubscribe previous listener
    userSession.unsubscribe?.();

    const unsubscribe = userSession.session.subscribe((event) => {
      const e = event as any;
      this.log(`event: ${event.type}`, e.toolName ?? e.assistantMessageEvent?.type ?? "");
      if (event.type === "message_update") {
        const ame = e.assistantMessageEvent;
        if (ame) {
          if (ame.type === "text_delta" && ame.delta) {
            callbacks.onTextDelta(ame.delta);
          }
        }
      } else if (event.type === "tool_execution_start") {
        callbacks.onToolStart(e.toolName, e.toolCallId);
      } else if (event.type === "tool_execution_end") {
        callbacks.onToolEnd(e.toolCallId, e.isError);
      } else if (event.type === "agent_end") {
        callbacks.onAgentEnd();
      }
    });

    userSession.unsubscribe = unsubscribe;
    return unsubscribe;
  }

  /**
   * Send a prompt to the user's session.
   */
  async prompt(telegramId: number, text: string, images?: any[]): Promise<void> {
    const userSession = await this.getOrCreate(telegramId);
    this.log(`prompt: "${text.slice(0, 80)}"`);
    await userSession.session.prompt(text, images ? { images } : undefined);
    this.log("prompt complete");
  }

  /**
   * Destroy a user's session.
   */
  destroy(telegramId: number): void {
    const userSession = this.sessions.get(telegramId);
    if (userSession) {
      userSession.unsubscribe?.();
      this.sessions.delete(telegramId);
    }
  }

  /**
   * Switch user's session to a different workspace.
   */
  async switchWorkspace(telegramId: number, workspaceName: string): Promise<boolean> {
    const userSession = this.sessions.get(telegramId);
    if (!userSession) return false;

    const ws = userSession.workspace;
    const switched = await ws.switchWorkspace(workspaceName);
    if (!switched) return false;

    // Destroy old session and create new one in new workspace
    this.destroy(telegramId);
    await this.getOrCreate(telegramId);
    return true;
  }
}

const DEFAULT_BASH_TIMEOUT_SECONDS = 120;

function patchBashTimeout(session: AgentSession): void {
  const tools = (session as any).agent.state.tools;
  const patched = tools.map((tool: any) => {
    if (tool.name !== "bash") return tool;

    const originalExecute = tool.execute;
    const execute = (toolCallId: string, params: any, signal: any, onUpdate: any) =>
      originalExecute(toolCallId, withDefaultBashTimeout(params), signal, onUpdate);

    return {
      ...tool,
      description: tool.description + ` Commands time out after ${DEFAULT_BASH_TIMEOUT_SECONDS}s by default. Pass a longer timeout for slow commands.`,
      execute,
    };
  });
  (session as any).agent.state.tools = patched;
}

function withDefaultBashTimeout<T>(params: T): T {
  if (typeof params !== "object" || params === null || !("command" in params)) return params;
  const p = params as any;
  if (p.timeout === undefined || p.timeout === null) {
    return { ...params, timeout: DEFAULT_BASH_TIMEOUT_SECONDS };
  }
  return params;
}
