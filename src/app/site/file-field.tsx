"use client";

import { useRef, useState } from "react";
import { uploadFormFileAction } from "@/modules/forms/actions";
import { MAX_FILES_PER_FIELD, type UploadedFile } from "@/modules/forms/fields";
import { prepareForUpload } from "@/lib/shrink-image";

/**
 * A file field on the storefront. Each file goes up on its own as soon
 * as it's picked — photos shrunk first, like the admin's library — and
 * the answer the form sends is the list of what landed. Up to five.
 */
export function FileField({ formId, field, inputClass }: { formId: string; field: { id: string; label: string; required: boolean }; inputClass: string }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = `f_${field.id}`;

  const add = async (picked: FileList | null) => {
    if (!picked) return;
    setError("");
    const room = MAX_FILES_PER_FIELD - files.length;
    const list = Array.from(picked).slice(0, room);
    if (picked.length > room) setError(`Up to ${MAX_FILES_PER_FIELD} files.`);
    for (const f of list) {
      setBusy((n) => n + 1);
      try {
        let blob: Blob = f;
        let type = f.type;
        let name = f.name;
        if (f.type.startsWith("image/") && f.type !== "image/gif") {
          const p = await prepareForUpload(f);
          blob = p.blob;
          type = p.type;
          name = f.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
        }
        const fd = new FormData();
        fd.set("file", new File([blob], name, { type }));
        const r = await uploadFormFileAction(formId, field.id, fd);
        if (!r.ok) throw new Error(r.error);
        setFiles((cur) => (cur.length < MAX_FILES_PER_FIELD ? [...cur, r.file] : cur));
      } catch (err) {
        setError(err instanceof Error ? err.message : "That file didn't go up. Try again.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div>
      <input type="hidden" name={id} value={files.length ? JSON.stringify(files) : ""} />
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        required={field.required && files.length === 0}
        disabled={files.length >= MAX_FILES_PER_FIELD}
        onChange={(e) => void add(e.target.files)}
        className={`${inputClass} h-12 py-2.5 file:mr-3 file:rounded-[5px] file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-[14px] file:text-white`}
      />
      {(files.length > 0 || busy > 0) && (
        <ul className="mt-2 space-y-1.5" aria-label="Files added">
          {files.map((u) => (
            <li key={u.key} className="flex items-center gap-2 text-[14px] text-[var(--text-body)]">
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-[12.5px] text-[var(--text-muted)]">{Math.max(1, Math.round(u.size / 1024))} KB</span>
              <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.key !== u.key))} aria-label={`Remove ${u.name}`} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                ×
              </button>
            </li>
          ))}
          {busy > 0 && <li className="text-[13px] text-[var(--text-muted)]">Uploading…</li>}
        </ul>
      )}
      {error && <p className="mt-1.5 text-[13px] text-[var(--alert-light,#e06464)]">{error}</p>}
    </div>
  );
}
