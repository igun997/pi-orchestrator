import { describe, expect, it } from "vitest";
import { generateSupabaseClient } from "./supabase-client.js";

describe("generateSupabaseClient", () => {
  it("imports createClient", () => {
    expect(generateSupabaseClient()).toContain("createClient");
  });

  it("uses PUBLIC_SUPABASE_URL env var", () => {
    expect(generateSupabaseClient()).toContain("PUBLIC_SUPABASE_URL");
  });

  it("imports Database type", () => {
    expect(generateSupabaseClient()).toContain("Database");
  });
});
