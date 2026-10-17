/**
 * CSV that opens cleanly in Excel, Numbers and Google Sheets: UTF-8 with a
 * byte-order mark (so Excel reads Thai and accents right), CRLF lines,
 * quotes where needed. A cell that starts with = + - @ (or a tab or return)
 * gets a leading ' so a spreadsheet shows it as text instead of running it
 * as a formula — a customer can type anything into a form.
 */

export type Cell = string | number | boolean | Date | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 16) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === "number")) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** "$12.50" → "12.50": money as a plain number a spreadsheet can add up. */
export function money(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}
