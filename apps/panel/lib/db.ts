import { DatabaseSync } from "node:sqlite";
import path from "node:path";

// The site reads the publishable snapshot (research/pipeline/export_site.py),
// unpacked from data/site.sqlite.gz before dev and build. Set RESEARCH_DB to
// point at the full local research database instead.
const DB_PATH = process.env.RESEARCH_DB ?? path.resolve(process.cwd(), "data/site.sqlite");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  db ??= new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
