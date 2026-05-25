import { describe, expect, it } from "vitest";
import { getSupabaseSchema } from "./supabase-templates.js";

describe("getSupabaseSchema", () => {
  it("returns no schema for none", () => {
    expect(getSupabaseSchema("none")).toBe("");
  });

  it("returns messages table with RLS for contact forms", () => {
    const schema = getSupabaseSchema("contact-form");

    expect(schema).toContain("create table if not exists public.messages");
    expect(schema).toContain("alter table public.messages enable row level security");
  });

  it("returns profiles table for auth", () => {
    const schema = getSupabaseSchema("auth");

    expect(schema).toContain("create table if not exists public.profiles");
  });

  it("returns pages, media, and storage setup for cms", () => {
    const schema = getSupabaseSchema("cms");

    expect(schema).toContain("create table if not exists public.pages");
    expect(schema).toContain("create table if not exists public.media");
    expect(schema).toContain("insert into storage.buckets");
  });
});
