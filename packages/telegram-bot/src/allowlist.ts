import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface Allowlist {
  admin: number;
  users: number[];
}

export class AllowlistManager {
  private allowlist: Allowlist;
  private filePath: string;

  constructor(dataDir: string, adminId: number) {
    this.filePath = join(dataDir, "allowlist.json");
    this.allowlist = { admin: adminId, users: [] };
  }

  async load(): Promise<void> {
    if (existsSync(this.filePath)) {
      const raw = await readFile(this.filePath, "utf8");
      this.allowlist = JSON.parse(raw) as Allowlist;
    }
  }

  async save(): Promise<void> {
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.allowlist, null, 2), "utf8");
  }

  isAdmin(userId: number): boolean {
    return userId === this.allowlist.admin;
  }

  isAllowed(userId: number): boolean {
    return userId === this.allowlist.admin || this.allowlist.users.includes(userId);
  }

  async addUser(userId: number): Promise<boolean> {
    if (this.allowlist.users.includes(userId)) return false;
    this.allowlist.users.push(userId);
    await this.save();
    return true;
  }

  async removeUser(userId: number): Promise<boolean> {
    const idx = this.allowlist.users.indexOf(userId);
    if (idx === -1) return false;
    this.allowlist.users.splice(idx, 1);
    await this.save();
    return true;
  }

  getUsers(): number[] {
    return [...this.allowlist.users];
  }
}
