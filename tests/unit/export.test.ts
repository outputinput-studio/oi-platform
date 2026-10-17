/**
 * Export everything (Stage 40): the zip we write by hand opens like any
 * other, and the CSVs open cleanly in a spreadsheet without running
 * anything a customer typed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ZipWriter } from "@/modules/export/zip";
import { money, toCsv } from "@/modules/export/csv";
import { collector, readZip } from "../zip-reader";

describe("zip", () => {
  test("text is deflated, photos stored, names are UTF-8, and it reads back exactly", async () => {
    const out = collector();
    const zip = new ZipWriter(out.write);
    const photo = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 256));
    await zip.addFile("products.csv", "Name\r\n".repeat(500), { compress: true });
    await zip.addFile("photos/ห้องซาวน่า.jpg", photo);
    await zip.addFile("empty.txt", "", { compress: true });
    await zip.finish();
    const files = readZip(out.bytes());
    expect([...files.keys()]).toEqual(["products.csv", "photos/ห้องซาวน่า.jpg", "empty.txt"]);
    expect(files.get("products.csv")!.toString()).toBe("Name\r\n".repeat(500));
    expect(files.get("photos/ห้องซาวน่า.jpg")!.equals(photo)).toBe(true);
    expect(out.bytes().length).toBeLessThan(3000 + 3000); // the CSV shrank
  });

  test("the same name twice gets (2); no climbing out of the folder", async () => {
    const zip = new ZipWriter(() => {});
    expect(await zip.addFile("photos/a.jpg", "x")).toBe("photos/a.jpg");
    expect(await zip.addFile("photos/A.jpg", "x")).toBe("photos/A (2).jpg");
    expect(await zip.addFile("photos/a.jpg", "x")).toBe("photos/a (3).jpg");
    expect(await zip.addFile("/../../etc/passwd", "x")).toBe("etc/passwd");
    expect(await zip.addFile('form-uploads/what?:"*.pdf', "x")).toBe("form-uploads/what____.pdf");
  });

  test("an ordinary unzip tool agrees (Python's zipfile, when there is one)", async () => {
    const out = collector();
    const zip = new ZipWriter(out.write);
    await zip.addFile("a.txt", "hello ".repeat(100), { compress: true });
    await zip.addFile("b/c.bin", new Uint8Array([1, 2, 3]));
    await zip.finish();
    const file = path.join(mkdtempSync(path.join(tmpdir(), "oi-zip-")), "t.zip");
    writeFileSync(file, out.bytes());
    let listed: string;
    try {
      listed = execFileSync("python3", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(' '.join(z.namelist()))", file]).toString().trim();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // no Python here: the reader above already checked it
      throw err;
    }
    expect(listed).toBe("a.txt b/c.bin");
  });
});

describe("csv", () => {
  test("a byte-order mark, CRLF, quotes where needed", () => {
    const csv = toCsv(["Name", "Note"], [["Amelia Frost", 'Said "hi", then left\nlater'], ["Tom", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('Name,Note\r\nAmelia Frost,"Said ""hi"", then left\nlater"\r\nTom,\r\n');
  });

  test("anything that would run as a formula is shown as text; numbers aren't touched", () => {
    const csv = toCsv(["x"], [["=HYPERLINK(\"http://evil\")"], ["+61 400 000 000"], ["-1"], ["@SUM(A1)"], [-12.5], [0]]);
    expect(csv.slice(1).split("\r\n").slice(1, 7)).toEqual([`"'=HYPERLINK(""http://evil"")"`, "'+61 400 000 000", "'-1", "'@SUM(A1)", "-12.5", "0"]);
  });

  test("money is a plain number a spreadsheet can add up", () => {
    expect(money(1250)).toBe("12.50");
    expect(money(0)).toBe("0.00");
    expect(money(null)).toBe("");
  });
});
