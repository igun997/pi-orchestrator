import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession,
  type CreateAgentSessionResult,
} from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";

import type { BotConfig } from "../config.js";
import { WorkspaceManager } from "./workspace.js";
import { buildPersona } from "../persona.js";

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

  constructor(config: BotConfig) {
    this.config = config;
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
    ];

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      additionalExtensionPaths: [extensionPath],
      additionalSkillPaths: skillPaths,
      systemPrompt: persona.systemPrompt,
    });

    const { session } = await createAgentSession({
      cwd,
      resourceLoader,
    });

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
      if (event.type === "message_update") {
        const ame = e.assistantMessageEvent;
        if (ame) {
          console.log(`[sub:${telegramId}] ame.type=${ame.type} delta=${(ame.delta ?? "").slice(0, 50)}`);
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
    console.log(`[session:${telegramId}] prompt: "${text.slice(0, 50)}"`);
    console.log(`[session:${telegramId}] model: ${userSession.session.agent?.state?.model?.name ?? "unknown"}`);
    await userSession.session.prompt(text, images ? { images } : undefined);
    console.log(`[session:${telegramId}] prompt complete`);
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
