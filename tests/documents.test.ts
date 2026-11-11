import { beforeEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import {
  addComment,
  createDocument,
  deleteComment,
  deleteDocument,
  getDocument,
  getVersion,
  heartbeat,
  listCollaborators,
  listComments,
  listVersions,
  listDocuments,
  renameDocument,
  restoreVersion,
  revokeShare,
  setCommentResolved,
  shareDocument,
  updateContent,
} from "@/lib/documents";
import { AppError } from "@/lib/errors";

const ALICE = "u_alice";
const BOB = "u_bob";
const CAROL = "u_carol";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** Run fn and return the AppError it throws (fails the test if it does not throw one). */
async function errorOf(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected an AppError");
}

beforeEach(async () => {
  await query("DELETE FROM documents");
});

describe("document ownership and sharing", () => {
  it("hides a document from users it was not shared with", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan" });
    expect((await getDocument(ALICE, id)).role).toBe("owner");
    expect((await errorOf(() => getDocument(BOB, id))).status).toBe(404);
    expect((await listDocuments(BOB)).shared).toHaveLength(0);
  });

  it("lets a viewer read but not edit, rename or share", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan" });
    await shareDocument(ALICE, id, "carol@ajaia.test", "viewer");

    const seen = await getDocument(CAROL, id);
    expect(seen.role).toBe("viewer");
    expect((await errorOf(() => updateContent(CAROL, id, doc("hi"), seen.version))).status).toBe(403);
    expect((await errorOf(() => renameDocument(CAROL, id, "Mine now"))).status).toBe(403);
    expect((await errorOf(() => shareDocument(CAROL, id, "bob@ajaia.test", "editor"))).status).toBe(403);
  });

  it("lets an editor save content, and the owner sees it", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan" });
    await shareDocument(ALICE, id, "BOB@ajaia.test ", "editor"); // email match is case/space tolerant

    const start = await getDocument(BOB, id);
    const saved = await updateContent(BOB, id, doc("Bob was here"), start.version);
    expect(saved.version).toBe(start.version + 1);

    const reread = await getDocument(ALICE, id);
    expect(JSON.stringify(reread.content)).toContain("Bob was here");
    expect(reread.updatedByName).toBe("Bob Okafor");
  });

  it("separates owned and shared documents in the dashboard list", async () => {
    const a = await createDocument(ALICE, { title: "Alice doc" });
    await createDocument(BOB, { title: "Bob doc" });
    await shareDocument(ALICE, a.id, "bob@ajaia.test", "editor");

    const bob = await listDocuments(BOB);
    expect(bob.owned.map((d) => d.title)).toEqual(["Bob doc"]);
    expect(bob.shared.map((d) => [d.title, d.role, d.ownerName])).toEqual([["Alice doc", "editor", "Alice Chen"]]);

    const alice = await listDocuments(ALICE);
    expect(alice.owned[0].shareCount).toBe(1);
  });

  it("changes a role on re-share and removes access on revoke", async () => {
    const { id } = await createDocument(ALICE);
    await shareDocument(ALICE, id, "bob@ajaia.test", "viewer");
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");
    expect((await listCollaborators(ALICE, id)).map((c) => [c.name, c.role])).toEqual([
      ["Alice Chen", "owner"],
      ["Bob Okafor", "editor"],
    ]);

    await revokeShare(ALICE, id, BOB);
    expect((await errorOf(() => getDocument(BOB, id))).status).toBe(404);
  });

  it("rejects bad share requests with clear errors", async () => {
    const { id } = await createDocument(ALICE);
    expect((await errorOf(() => shareDocument(ALICE, id, "nobody@ajaia.test", "viewer"))).code).toBe("user_not_found");
    expect((await errorOf(() => shareDocument(ALICE, id, "alice@ajaia.test", "viewer"))).code).toBe("share_with_self");
  });

  it("only lets the owner delete", async () => {
    const { id } = await createDocument(ALICE);
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");
    expect((await errorOf(() => deleteDocument(BOB, id))).status).toBe(403);
    await deleteDocument(ALICE, id);
    expect((await errorOf(() => getDocument(ALICE, id))).status).toBe(404);
  });
});

describe("saving", () => {
  it("refuses a stale save with 409 and returns the latest copy", async () => {
    const { id } = await createDocument(ALICE);
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");
    const base = (await getDocument(ALICE, id)).version;

    await updateContent(BOB, id, doc("Bob first"), base);
    const conflict = await errorOf(() => updateContent(ALICE, id, doc("Alice second"), base));

    expect(conflict.status).toBe(409);
    const details = conflict.details as { version: number; content: unknown; updatedByName: string };
    expect(details.version).toBe(base + 1);
    expect(details.updatedByName).toBe("Bob Okafor");
    expect(JSON.stringify(details.content)).toContain("Bob first");
  });

  it("rejects content that does not match the editor schema", async () => {
    const { id } = await createDocument(ALICE);
    const v = (await getDocument(ALICE, id)).version;
    const evil = { type: "doc", content: [{ type: "script", text: "alert(1)" }] };
    expect((await errorOf(() => updateContent(ALICE, id, evil, v))).code).toBe("invalid_content");
    expect((await errorOf(() => updateContent(ALICE, id, "not json", v))).code).toBe("invalid_content");
  });

  it("validates titles on rename", async () => {
    const { id } = await createDocument(ALICE, { title: "   " });
    expect((await getDocument(ALICE, id)).title).toBe("Untitled document");
    expect((await errorOf(() => renameDocument(ALICE, id, "   "))).code).toBe("invalid_title");
    expect((await renameDocument(ALICE, id, "  Q3   roadmap ")).title).toBe("Q3 roadmap");
  });
});

describe("presence", () => {
  it("shows who else has the document open, and only to people with access", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan" });
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");

    expect((await heartbeat(ALICE, id, false)).active).toEqual([]);
    const seenByBob = await heartbeat(BOB, id, true);
    expect(seenByBob.active.map((p) => p.name)).toEqual(["Alice Chen"]);
    const seenByAlice = await heartbeat(ALICE, id, false);
    expect(seenByAlice.active).toEqual([expect.objectContaining({ name: "Bob Okafor", editing: true })]);
    expect(seenByAlice.version).toBe(1);

    expect((await errorOf(() => heartbeat(CAROL, id, false))).status).toBe(404);
  });

  it("drops people whose last heartbeat is too old", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan" });
    await shareDocument(ALICE, id, "bob@ajaia.test", "viewer");
    await heartbeat(BOB, id, false);
    await query("UPDATE document_presence SET last_seen = now() - interval '1 minute'");
    expect((await heartbeat(ALICE, id, false)).active).toEqual([]);
  });
});

describe("version history", () => {
  it("keeps the original, merges quick saves by one person, and restores", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan", content: doc("original") });
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");

    let v = (await updateContent(ALICE, id, doc("first edit"), 1)).version;
    v = (await updateContent(ALICE, id, doc("second edit"), v)).version; // same person, within the window: merged
    v = (await updateContent(BOB, id, doc("bob edit"), v)).version;

    const history = await listVersions(ALICE, id);
    expect(history.map((h) => [h.kind, h.authorName])).toEqual([
      ["edit", "Bob Okafor"],
      ["edit", "Alice Chen"],
      ["baseline", "Alice Chen"],
    ]);
    expect(JSON.stringify((await getVersion(ALICE, id, history[1].id)).content)).toContain("second edit");

    const baseline = history[2];
    expect((await errorOf(() => restoreVersion(ALICE, id, baseline.id, v - 1))).status).toBe(409); // stale base
    const restored = await restoreVersion(ALICE, id, baseline.id, v);
    expect(JSON.stringify((await getDocument(BOB, id)).content)).toContain("original");
    expect(restored.version).toBe(v + 1);
    expect((await listVersions(BOB, id))[0].kind).toBe("restore");
  });

  it("hides history from viewers and from other documents", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan", content: doc("a") });
    const other = await createDocument(BOB, { title: "Other", content: doc("b") });
    await shareDocument(ALICE, id, "carol@ajaia.test", "viewer");
    await updateContent(ALICE, id, doc("a2"), 1);
    await updateContent(BOB, other.id, doc("b2"), 1);

    expect((await errorOf(() => listVersions(CAROL, id))).status).toBe(403);
    const bobsVersion = (await listVersions(BOB, other.id))[0];
    expect((await errorOf(() => getVersion(ALICE, id, bobsVersion.id))).status).toBe(404);
    expect((await errorOf(() => getVersion(ALICE, id, "not-a-number"))).status).toBe(404);
  });
});

describe("comments", () => {
  it("lets editors comment and resolve, viewers only read", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan", content: doc("a") });
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");
    await shareDocument(ALICE, id, "carol@ajaia.test", "viewer");

    const c = await addComment(BOB, id, "  Can we cut this?  ", "  some   selected\ntext ");
    expect(c).toMatchObject({ body: "Can we cut this?", quote: "some selected text", authorName: "Bob Okafor", resolved: false });

    expect((await errorOf(() => addComment(CAROL, id, "hi"))).status).toBe(403);
    expect((await errorOf(() => addComment(BOB, id, "   "))).status).toBe(400);
    expect((await listComments(CAROL, id)).map((x) => x.body)).toEqual(["Can we cut this?"]);

    await setCommentResolved(ALICE, id, c.id, true);
    expect((await listComments(BOB, id))[0].resolved).toBe(true);
    expect((await errorOf(() => setCommentResolved(CAROL, id, c.id, false))).status).toBe(403);
  });

  it("only lets the author or the owner delete, and keeps comments inside their document", async () => {
    const { id } = await createDocument(ALICE, { title: "Plan", content: doc("a") });
    const other = await createDocument(BOB, { title: "Other", content: doc("b") });
    await shareDocument(ALICE, id, "bob@ajaia.test", "editor");
    await shareDocument(ALICE, id, "carol@ajaia.test", "editor");
    const bobs = await addComment(BOB, id, "Bob's note");
    const elsewhere = await addComment(BOB, other.id, "Other doc");

    expect((await errorOf(() => deleteComment(CAROL, id, bobs.id))).status).toBe(403);
    expect((await errorOf(() => setCommentResolved(ALICE, id, elsewhere.id, true))).status).toBe(404);
    expect((await errorOf(() => listComments(CAROL, other.id))).status).toBe(404);
    await deleteComment(ALICE, id, bobs.id);
    expect(await listComments(BOB, id)).toEqual([]);
  });
});
