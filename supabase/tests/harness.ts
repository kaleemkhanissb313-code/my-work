/**
 * Runs the real Supabase migrations on PGlite (Postgres compiled to WebAssembly) with a minimal stand-in for the
 * Supabase platform: the `auth` schema + auth.uid(), the anon/authenticated roles with Supabase's default grants,
 * and the storage tables. Queries can then be executed AS a given user, so Row Level Security is genuinely enforced.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const PLATFORM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb not null default '{}', created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
-- Like Supabase: new objects in public are granted to the API roles at creation time (so later REVOKEs stick).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

export async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  await db.exec(PLATFORM)
  const dir = join(process.cwd(), 'supabase', 'migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    try { await db.exec(readFileSync(join(dir, f), 'utf8')) } catch (e) { throw new Error(`Migration ${f} failed: ${(e as Error).message}`) }
  }
  return db
}

export type Db = Awaited<ReturnType<typeof freshDb>>
export const uidOf = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

export async function addUser(db: Db, n: number, email: string) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [uidOf(n), email])
  return uidOf(n)
}

/** Runs `fn` inside a transaction as the given user (null = anonymous visitor), exactly like a PostgREST request. */
export async function as<T>(db: Db, userId: string | null, fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' })])
    return fn(async (sql, params) => (await tx.query(sql, params)).rows as never)
  })
}

/** Expects the promise to fail with a database error (permission / RLS / raised exception). */
export async function denied(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as Error).message }
  throw new Error('Expected the database to refuse this operation, but it succeeded.')
}
