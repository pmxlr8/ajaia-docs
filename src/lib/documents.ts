/**
 * Document service. Every function takes the acting user's id and enforces
 * access rules itself, so route handlers stay thin and tests can exercise the
 * real rules without HTTP.
 */
import crypto from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { can, type Role, type ShareRole } from "./access";
import { EMPTY_DOC, validateContent } from "./content";
import { query } from "./db";
import { AppError, badRequest, forbidden, notFound } from "./errors";
import { SEED_USERS } from "./migrate";
import { snippetOf } from "./text";
import { getUserByEmail } from "./users";

export const DEFAULT_TITLE = "Untitled document";
export const MAX_TITLE_LENGTH = 200;

export interface DocSummary {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  role: Role;
  updatedAt: string;
  shareCount: number;
  snippet: string;
}

export interface DocDetail {
  id: string;
  title: string;
  content: JSONContent;
  version: number;
  ownerId: string;
  ownerName: string;
  role: Role;
  updatedAt: string;
  updatedByName: string | null;
}

export interface Collaborator {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: Role;
}

const iso = (d: unknown) => new Date(d as string).toISOString();

export function normalizeTitle(raw: string | undefined | null): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return DEFAULT_TITLE;
  return t.slice(0, MAX_TITLE_LENGTH);
}

/** Docs often open with a heading equal to their title; the card already shows the title. */
function withoutLeadingTitle(snippet: string, title: string): string {
  return snippet.toLowerCase().startsWith(title.toLowerCase()) ? snippet.slice(title.length).trim() : snippet;
}

async function resolveRole(docId: string, userId: string): Promise<Role | null> {
  const rows = await query<{ owner_id: string; role: ShareRole | null }>(
    `SELECT d.owner_id, s.role
       FROM documents d
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = $2
      WHERE d.id = $1`,
    [docId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.owner_id === userId) return "owner";
  return row.role ?? null;
}

/** Resolve the actor's role or throw. Missing and no-access both return 404 so ids do not leak. */
async function requireRole(docId: string, userId: string): Promise<Role> {
  const role = await resolveRole(docId, userId);
  if (!role) throw notFound();
  return role;
}

export async function createDocument(
  actorId: string,
  input: { title?: string; content?: unknown } = {},
): Promise<{ id: string }> {
  const content = input.content === undefined ? EMPTY_DOC : validateContent(input.content);
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO documents (id, owner_id, title, content, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $2)`,
    [id, actorId, normalizeTitle(input.title), JSON.stringify(content)],
  );
  return { id };
}

export async function listDocuments(actorId: string): Promise<{ owned: DocSummary[]; shared: DocSummary[] }> {
  type Row = {
    id: string;
    title: string;
    owner_id: string;
    owner_name: string;
    owner_color: string;
    updated_at: string;
    share_count: number;
    role: ShareRole | null;
    content: unknown;
  };

  const owned = await query<Row>(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color, d.updated_at, d.content,
            (SELECT count(*) FROM document_shares s WHERE s.document_id = d.id)::int AS share_count,
            NULL AS role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
      WHERE d.owner_id = $1
      ORDER BY d.updated_at DESC`,
    [actorId],
  );
  const shared = await query<Row>(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color, d.updated_at, d.content,
            0 AS share_count, s.role
       FROM document_shares s
       JOIN documents d ON d.id = s.document_id
       JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = $1
      ORDER BY d.updated_at DESC`,
    [actorId],
  );

  const map = (r: Row): DocSummary => ({
    id: r.id,
    title: r.title,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerColor: r.owner_color,
    role: r.role ?? "owner",
    updatedAt: iso(r.updated_at),
    shareCount: Number(r.share_count),
    snippet: withoutLeadingTitle(snippetOf(r.content), r.title),
  });
  return { owned: owned.map(map), shared: shared.map(map) };
}

export async function getDocument(actorId: string, docId: string): Promise<DocDetail> {
  const role = await requireRole(docId, actorId);
  const rows = await query<{
    id: string;
    title: string;
    content: JSONContent;
    version: number;
    owner_id: string;
    owner_name: string;
    updated_at: string;
    updated_by_name: string | null;
  }>(
    `SELECT d.id, d.title, d.content, d.version, d.owner_id, o.name AS owner_name,
            d.updated_at, ub.name AS updated_by_name
       FROM documents d
       JOIN users o ON o.id = d.owner_id
       LEFT JOIN users ub ON ub.id = d.updated_by
      WHERE d.id = $1`,
    [docId],
  );
  const r = rows[0];
  if (!r) throw notFound();
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    version: r.version,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    role,
    updatedAt: iso(r.updated_at),
    updatedByName: r.updated_by_name,
  };
}

export async function renameDocument(actorId: string, docId: string, rawTitle: string) {
  const role = await requireRole(docId, actorId);
  if (!can.rename(role)) throw forbidden("Viewers cannot rename this document.");
  const title = rawTitle.replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("Title cannot be empty.", "invalid_title");
  if (title.length > MAX_TITLE_LENGTH) throw badRequest(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`, "invalid_title");

  const rows = await query<{ title: string; updated_at: string }>(
    `UPDATE documents SET title = $1, updated_at = now() WHERE id = $2 RETURNING title, updated_at`,
    [title, docId],
  );
  return { title: rows[0].title, updatedAt: iso(rows[0].updated_at) };
}

/**
 * Save new content with optimistic concurrency. The client sends the version it
 * started from; if someone else saved in between, we refuse with 409 and return
 * the latest copy so the client can choose what to keep. This avoids silent
 * last-write-wins data loss between collaborators without needing CRDTs.
 */
export async function updateContent(actorId: string, docId: string, content: unknown, baseVersion: number) {
  const role = await requireRole(docId, actorId);
  if (!can.edit(role)) throw forbidden("You have view-only access to this document.");
  return saveContent(actorId, docId, validateContent(content), baseVersion, "edit");
}

/** Optimistic-concurrency save shared by normal edits and version restores. */
async function saveContent(actorId: string, docId: string, clean: JSONContent, baseVersion: number, kind: "edit" | "restore") {
  await recordBaseline(docId);
  const rows = await query<{ version: number; updated_at: string }>(
    `UPDATE documents
        SET content = $1::jsonb, version = version + 1, updated_at = now(), updated_by = $2
      WHERE id = $3 AND version = $4
      RETURNING version, updated_at`,
    [JSON.stringify(clean), actorId, docId, baseVersion],
  );
  if (rows.length === 0) {
    const latest = await getDocument(actorId, docId);
    throw new AppError(409, "version_conflict", `${latest.updatedByName ?? "Someone"} saved a newer version of this document.`, {
      version: latest.version,
      content: latest.content,
      updatedByName: latest.updatedByName,
      updatedAt: latest.updatedAt,
    });
  }
  await recordVersion(docId, actorId, kind);
  return { version: rows[0].version, updatedAt: iso(rows[0].updated_at) };
}

export async function deleteDocument(actorId: string, docId: string): Promise<void> {
  const role = await requireRole(docId, actorId);
  if (!can.delete(role)) throw forbidden("Only the owner can delete this document.");
  await query(`DELETE FROM documents WHERE id = $1`, [docId]);
}

export async function listCollaborators(actorId: string, docId: string): Promise<Collaborator[]> {
  await requireRole(docId, actorId);
  const rows = await query<{ user_id: string; name: string; email: string; color: string; role: Role }>(
    `SELECT u.id AS user_id, u.name, u.email, u.color, 'owner' AS role, 0 AS ord
       FROM documents d JOIN users u ON u.id = d.owner_id
      WHERE d.id = $1
     UNION ALL
     SELECT u.id, u.name, u.email, u.color, s.role, 1 AS ord
       FROM document_shares s JOIN users u ON u.id = s.user_id
      WHERE s.document_id = $1
     ORDER BY ord, name`,
    [docId],
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, color: r.color, role: r.role }));
}

/** Grant (or change) access for another user by email. Owner only. */
export async function shareDocument(actorId: string, docId: string, email: string, role: ShareRole) {
  const actorRole = await requireRole(docId, actorId);
  if (!can.share(actorRole)) throw forbidden("Only the owner can change sharing.");
  if (role !== "editor" && role !== "viewer") throw badRequest("Role must be editor or viewer.", "invalid_role");

  const target = await getUserByEmail(email);
  if (!target) {
    const demo = SEED_USERS.map((u) => u.email).join(", ");
    throw new AppError(404, "user_not_found", `No account uses that email. Demo accounts: ${demo}.`);
  }
  if (target.id === actorId) throw badRequest("You already own this document.", "share_with_self");

  await query(
    `INSERT INTO document_shares (document_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [docId, target.id, role],
  );
  return listCollaborators(actorId, docId);
}

export async function revokeShare(actorId: string, docId: string, userId: string) {
  const actorRole = await requireRole(docId, actorId);
  if (!can.share(actorRole)) throw forbidden("Only the owner can change sharing.");
  await query(`DELETE FROM document_shares WHERE document_id = $1 AND user_id = $2`, [docId, userId]);
  return listCollaborators(actorId, docId);
}

/** Lightweight version probe used by open editors to notice other people's saves. */
export async function getDocumentVersion(actorId: string, docId: string) {
  await requireRole(docId, actorId);
  const rows = await query<{ version: number; updated_at: string; updated_by_name: string | null }>(
    `SELECT d.version, d.updated_at, u.name AS updated_by_name
       FROM documents d LEFT JOIN users u ON u.id = d.updated_by WHERE d.id = $1`,
    [docId],
  );
  return { version: rows[0].version, updatedAt: iso(rows[0].updated_at), updatedByName: rows[0].updated_by_name };
}

// ---------- Presence ----------

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  editing: boolean;
}

const PRESENCE_WINDOW_SECONDS = 15;

/**
 * Heartbeat from an open editor. Records that the actor has the document open
 * (and whether they are typing), and returns the latest version plus everyone
 * else who sent a heartbeat in the last few seconds.
 */
export async function heartbeat(actorId: string, docId: string, editing: boolean) {
  await requireRole(docId, actorId);
  await query(
    `INSERT INTO document_presence (document_id, user_id, last_seen, editing) VALUES ($1, $2, now(), $3)
     ON CONFLICT (document_id, user_id) DO UPDATE SET last_seen = now(), editing = EXCLUDED.editing`,
    [docId, actorId, editing],
  );
  const [latest, active] = await Promise.all([
    getDocumentVersion(actorId, docId),
    query<{ user_id: string; name: string; color: string; editing: boolean }>(
      `SELECT p.user_id, u.name, u.color, p.editing
         FROM document_presence p JOIN users u ON u.id = p.user_id
        WHERE p.document_id = $1 AND p.user_id <> $2
          AND p.last_seen > now() - make_interval(secs => $3)
        ORDER BY u.name`,
      [docId, actorId, PRESENCE_WINDOW_SECONDS],
    ),
  ]);
  const people: PresenceUser[] = active.map((r) => ({ userId: r.user_id, name: r.name, color: r.color, editing: r.editing }));
  return { ...latest, active: people };
}

// ---------- Version history ----------

export interface VersionSummary {
  id: string;
  version: number;
  title: string;
  kind: "baseline" | "edit" | "restore";
  createdAt: string;
  authorName: string | null;
  authorColor: string | null;
}

/** Saves by the same person within this window are merged into one history entry. */
const MERGE_WINDOW_SECONDS = 120;

/** Before the first tracked save, keep the document as it was, so it can always be restored. */
async function recordBaseline(docId: string) {
  await query(
    `INSERT INTO document_versions (document_id, version, title, content, kind, created_by, created_at)
     SELECT id, version, title, content, 'baseline', updated_by, updated_at FROM documents
      WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM document_versions WHERE document_id = $1)`,
    [docId],
  );
}

async function recordVersion(docId: string, actorId: string, kind: "edit" | "restore") {
  if (kind === "edit") {
    const merged = await query(
      `UPDATE document_versions v
          SET version = d.version, title = d.title, content = d.content, created_at = now()
         FROM documents d
        WHERE v.id = (SELECT id FROM document_versions WHERE document_id = $1 ORDER BY id DESC LIMIT 1)
          AND d.id = $1 AND v.kind = 'edit' AND v.created_by = $2
          AND v.created_at > now() - make_interval(secs => $3)
        RETURNING v.id`,
      [docId, actorId, MERGE_WINDOW_SECONDS],
    );
    if (merged.length > 0) return;
  }
  await query(
    `INSERT INTO document_versions (document_id, version, title, content, kind, created_by)
     SELECT id, version, title, content, $3, $2 FROM documents WHERE id = $1`,
    [docId, actorId, kind],
  );
}

async function requireHistoryAccess(docId: string, actorId: string) {
  const role = await requireRole(docId, actorId);
  if (!can.edit(role)) throw forbidden("Only editors and the owner can see version history.");
}

type VersionRow = {
  id: string;
  version: number;
  title: string;
  kind: VersionSummary["kind"];
  created_at: string;
  author_name: string | null;
  author_color: string | null;
};

const toSummary = (r: VersionRow): VersionSummary => ({
  id: r.id,
  version: r.version,
  title: r.title,
  kind: r.kind,
  createdAt: iso(r.created_at),
  authorName: r.author_name,
  authorColor: r.author_color,
});

export async function listVersions(actorId: string, docId: string): Promise<VersionSummary[]> {
  await requireHistoryAccess(docId, actorId);
  const rows = await query<VersionRow>(
    `SELECT v.id::text AS id, v.version, v.title, v.kind, v.created_at, u.name AS author_name, u.color AS author_color
       FROM document_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.document_id = $1 ORDER BY v.id DESC LIMIT 50`,
    [docId],
  );
  return rows.map(toSummary);
}

export async function getVersion(actorId: string, docId: string, versionId: string): Promise<VersionSummary & { content: JSONContent }> {
  await requireHistoryAccess(docId, actorId);
  if (!/^\d{1,18}$/.test(versionId)) throw notFound();
  const rows = await query<VersionRow & { content: JSONContent }>(
    `SELECT v.id::text AS id, v.version, v.title, v.kind, v.created_at, v.content, u.name AS author_name, u.color AS author_color
       FROM document_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.id = $1::bigint AND v.document_id = $2`,
    [versionId, docId],
  );
  if (rows.length === 0) throw notFound();
  return { ...toSummary(rows[0]), content: rows[0].content };
}

/** Restore = a normal save of the old content, so the same conflict check applies. */
export async function restoreVersion(actorId: string, docId: string, versionId: string, baseVersion: number) {
  const snapshot = await getVersion(actorId, docId, versionId);
  const clean = validateContent(snapshot.content);
  const saved = await saveContent(actorId, docId, clean, baseVersion, "restore");
  return { ...saved, content: clean };
}
