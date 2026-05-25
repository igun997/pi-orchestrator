type SupabaseLevel = "none" | "contact-form" | "auth" | "cms";

const contactFormSchema = `create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "allow public message inserts"
  on public.messages for insert
  to anon
  with check (true);
`;

const authSchema = `create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are editable by owner"
  on public.profiles for update
  using (auth.uid() = id);
`;

const cmsSchema = `create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'media',
  path text not null,
  alt text,
  created_at timestamptz not null default now()
);

alter table public.pages enable row level security;
alter table public.media enable row level security;

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
`;

export function getSupabaseSchema(level: SupabaseLevel): string {
  if (level === "none") return "";
  if (level === "contact-form") return contactFormSchema;
  if (level === "auth") return authSchema;
  return cmsSchema;
}
