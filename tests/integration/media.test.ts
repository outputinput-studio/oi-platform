/**
 * The media library: upload, describe, delete, and the site lock across it.
 * Runs against the local-disk storage fallback (no R2 in tests).
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { AccessError } from "@/modules/auth/access";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-media-ann"; // manager at A
const bob = "test-media-bob"; // owner of B
// The default local-disk folder (gitignored). env() is read once at import, so it can't be redirected here.
const dir = path.resolve(".media-local");

// 1×1 PNG, enough to be a real file.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('media-a','media-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('media-a','Media A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('media-b','Media B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@media.invalid',true,now()), ($2,'Bob','bob@media.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'manager'), ($2,$4,'owner')`, [
    ann,
    bob,
    siteA,
    siteB,
  ]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('media-a','media-b')`);
  await owner.end();
});

describe("media", () => {
  let id = "";

  test("a picture is stored under the site's folder and listed with its address", async () => {
    const { uploadMedia, listMedia } = await import("@/modules/media/server");
    const item = await uploadMedia({
      actorId: ann,
      siteId: siteA,
      filename: "Shop front.png",
      contentType: "image/png",
      bytes: new Uint8Array(PNG),
      width: 1,
      height: 1,
    });
    id = item.id;
    expect(item.key).toBe(`${siteA}/${item.id}.png`);
    expect(item.url).toBe(`/api/media-local/${item.key}`);
    expect((await stat(path.join(dir, item.key))).size).toBe(PNG.length);
    expect(await readFile(path.join(dir, item.key))).toEqual(PNG);
    expect((await listMedia({ actorId: ann, siteId: siteA })).map((m) => m.id)).toEqual([id]);
  });

  test("wrong kinds and sizes are refused in plain words", async () => {
    const { uploadMedia, MAX_BYTES } = await import("@/modules/media/server");
    const base = { actorId: ann, siteId: siteA, filename: "x", width: 1, height: 1 };
    await expect(uploadMedia({ ...base, contentType: "image/tiff", bytes: new Uint8Array(PNG) })).rejects.toThrow(/JPG, PNG/);
    await expect(uploadMedia({ ...base, contentType: "image/svg+xml", bytes: new Uint8Array(PNG) })).rejects.toThrow(/doesn't look like an SVG/);
    const bad = new TextEncoder().encode(`<svg onload="alert(1)"><path/></svg>`);
    await expect(uploadMedia({ ...base, contentType: "image/svg+xml", bytes: bad })).rejects.toThrow(/can't be used/);
    await expect(uploadMedia({ ...base, contentType: "image/png", bytes: new Uint8Array(0) })).rejects.toThrow(/empty/);
    await expect(uploadMedia({ ...base, contentType: "image/png", bytes: new Uint8Array(MAX_BYTES + 1) })).rejects.toThrow(/too big/);
    await expect(uploadMedia({ ...base, contentType: "image/png", bytes: new Uint8Array(PNG), width: 0 })).rejects.toThrow();
  });

  test("an SVG logo is stored as it is, at the size the file says (not the browser)", async () => {
    const { uploadMedia } = await import("@/modules/media/server");
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><path d="M0 0h240v60H0z"/></svg>`);
    const item = await uploadMedia({ actorId: ann, siteId: siteA, filename: "wordmark - white.svg", contentType: "image/svg+xml", bytes: svg, width: 9, height: 9 });
    expect(item).toMatchObject({ contentType: "image/svg+xml", width: 240, height: 60 });
    expect(item.key).toMatch(/\.svg$/);
    expect(new Uint8Array(await readFile(path.join(dir, item.key)))).toEqual(svg);
    const { deleteMedia } = await import("@/modules/media/server");
    await deleteMedia({ actorId: ann, siteId: siteA, mediaId: item.id }); // leave the library as the next test expects it
  });

  test("describe this photo", async () => {
    const { describeMedia, getMedia } = await import("@/modules/media/server");
    await describeMedia({ actorId: ann, siteId: siteA, mediaId: id, alt: "  Our shop front on a sunny day " });
    expect((await getMedia({ actorId: ann, siteId: siteA, mediaId: id })).alt).toBe("Our shop front on a sunny day");
  });

  test("another site can't see, describe or delete it", async () => {
    const { deleteMedia, describeMedia, getMedia, listMedia } = await import("@/modules/media/server");
    await expect(listMedia({ actorId: bob, siteId: siteA })).rejects.toThrow(AccessError);
    expect(await listMedia({ actorId: bob, siteId: siteB })).toEqual([]);
    await expect(getMedia({ actorId: bob, siteId: siteB, mediaId: id })).rejects.toThrow(/doesn't exist/);
    await expect(describeMedia({ actorId: bob, siteId: siteB, mediaId: id, alt: "mine" })).rejects.toThrow(/doesn't exist/);
    await expect(deleteMedia({ actorId: bob, siteId: siteB, mediaId: id })).rejects.toThrow(/doesn't exist/);
  });

  test("delete is soft in the database and real in storage", async () => {
    const { deleteMedia, listMedia } = await import("@/modules/media/server");
    const key = `${siteA}/${id}.png`;
    await deleteMedia({ actorId: ann, siteId: siteA, mediaId: id });
    expect(await listMedia({ actorId: ann, siteId: siteA })).toEqual([]);
    await expect(stat(path.join(dir, key))).rejects.toThrow();
    const r = await owner.query(`select deleted_at from media where id = $1`, [id]);
    expect(r.rows[0].deleted_at).not.toBeNull();
    await expect(deleteMedia({ actorId: ann, siteId: siteA, mediaId: id })).rejects.toThrow(/doesn't exist/);
  });

  test("a section can only point at a library key", async () => {
    const { parseSectionData } = await import("@/modules/pages/registry");
    expect(() => parseSectionData("hero", { image: { key: "../etc/passwd", width: 1, height: 1 } })).toThrow(/library/);
    expect(() => parseSectionData("hero", { image: { key: `${siteA}/${id}.png`, width: 1, height: 1 } })).not.toThrow();
  });
});
