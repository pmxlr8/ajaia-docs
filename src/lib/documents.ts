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
  const clean = validateContent(content);

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
