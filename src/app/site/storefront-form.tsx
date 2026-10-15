"use client";

import { useActionState } from "react";
import { submitFormAction, type FormState } from "@/modules/forms/actions";
import type { Field } from "@/modules/forms/fields";
import { FileField } from "./file-field";

/**
 * A form on the storefront, drawn from its fields. Everything reads the
 * site's theme variables, so it matches the rest of the page in either
 * mode and takes the brand colour for the button. Once sent, the form
 * is replaced by the thank-you the client wrote.
 */
export function StorefrontForm({ form }: { form: { id: string; fields: Field[]; buttonText: string; afterMessage: string } }) {
  const [state, act, pending] = useActionState(submitFormAction.bind(null, form.id), {} as FormState);

  if (state.ok) {
    return (
      <p role="status" className="max-w-2xl rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-[17px] leading-relaxed">
        {state.ok}
      </p>
    );
  }

  const input = "block w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[16px] text-[var(--text)] outline-none focus:border-[var(--accent)]";
  return (
    <form action={act} className="max-w-xl space-y-5">
      {form.fields.map((f) => {
        const id = `f_${f.id}`;
        return (
          <div key={f.id}>
            <label htmlFor={id} className="mb-1.5 block text-[14.5px] text-[var(--text-body)]">
              {f.label}
              {f.required && <span aria-hidden> *</span>}
            </label>
            {f.type === "file" ? (
              <FileField formId={form.id} field={f} inputClass={input} />
            ) : f.type === "longText" ? (
              <textarea id={id} name={id} rows={5} required={f.required} className={`${input} py-3 leading-relaxed`} />
            ) : f.type === "choice" ? (
              <select id={id} name={id} required={f.required} defaultValue="" className={`${input} h-12`}>
                <option value="" disabled={f.required}>
                  {f.required ? "Pick one" : "—"}
                </option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={id}
                type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
                required={f.required}
                autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "text" ? "name" : undefined}
                className={`${input} h-12`}
              />
            )}
            {f.help && <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">{f.help}</p>}
          </div>
        );
      })}
      {/* The trap: people never see it, bots fill it in. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={`website_${form.id}`}>Website</label>
        <input id={`website_${form.id}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error && (
        <p role="alert" className="text-[14px] text-[var(--alert-light,#e06464)]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-[6px] bg-[var(--accent)] px-6 text-[16px] font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : form.buttonText}
      </button>
    </form>
  );
}
