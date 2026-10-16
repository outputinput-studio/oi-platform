"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveFormAction } from "@/modules/forms/actions";
import { FIELD_TYPES, FIELD_TYPE_LIST, fieldSummary, fillIns, newField, type Field, type FieldType, type FormSettings } from "@/modules/forms/fields";
import { Button, Field as FieldRow, Input, Label, PageHeader, Select, Sheet, Switch, Textarea } from "../../../ui";
import { SortableItem, SortableList } from "../../../sortable";
import { FieldErrors } from "@/lib/field-errors";

/**
 * The form editor, as in design/admin.html: the form's name, its fields
 * as folding cards (label, type, options, help, required), then what
 * happens when it's sent. Everything autosaves a moment after a change;
 * the header shows Saved / Saving… / Retry for the whole form.
 */
export function FormEditor({ formId, initial, deleteAction }: { formId: string; initial: FormSettings; deleteAction: (form: FormData) => Promise<void> }) {
  const [form, setForm] = useState<FormSettings>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<string[]>();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (snapshot: FormSettings) => {
      setStatus("saving");
      try {
        // A half-typed option is nothing yet, not an error.
        const clean = { ...snapshot, fields: snapshot.fields.map((f) => ({ ...f, options: f.options.filter((o) => o.trim()) })) };
        const r = await saveFormAction(formId, clean);
        if (r.error) {
          setError(r.error);
          setFields(r.fields);
          // A problem inside a folded question: open it, so it can be shown.
          const at = r.fields?.map((f) => /^fields\.(\d+)/.exec(f)?.[1]).find(Boolean);
          if (at !== undefined && snapshot.fields[Number(at)]) setOpen(snapshot.fields[Number(at)].id);
          setStatus("error");
        } else setStatus("saved");
      } catch {
        setError("couldn't reach the server");
        setStatus("error");
      }
    },
    [formId],
  );
  const change = (patch: Partial<FormSettings>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setStatus("idle"); // not saved yet: the header's tick goes away until it is
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setField = (id: string, patch: Partial<Field>) => change({ fields: form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const moveField = (id: string, dir: -1 | 1) => {
    const i = form.fields.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= form.fields.length) return;
    const next = [...form.fields];
    [next[i], next[j]] = [next[j], next[i]];
    change({ fields: next });
  };
  const removeField = (id: string) => change({ fields: form.fields.filter((f) => f.id !== id) });
  const addField = (type: FieldType) => {
    const f = newField(type);
    change({ fields: [...form.fields, f] });
    setOpen(f.id);
    setAdding(false);
  };

  return (
    <>
      <PageHeader
        title="Edit form"
        back="/forms"
        actions={
          <span data-testid="form-save-status" className={`text-[13px] ${status === "error" ? "text-alert" : status === "saved" ? "text-success" : "text-muted"}`}>
            {status === "saving" && "Saving…"}
            {status === "saved" && "✓ Saved"}
            {status === "error" && (
              <button type="button" onClick={() => void save(form)} className="underline underline-offset-4">
                Retry — {error}
              </button>
            )}
            {status === "error" && <FieldErrors fields={fields} />}
          </span>
        }
      />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <FieldRow label="Form name" htmlFor="form-name" hint="Only you see this name.">
          <Input id="form-name" data-field="name" value={form.name} maxLength={80} onChange={(e) => change({ name: e.target.value })} />
        </FieldRow>

        <Label className="mt-7" right={form.fields.length > 1 ? "Drag to reorder" : undefined}>
          Fields
        </Label>
        <section className="space-y-2.5" aria-label="Fields">
          {form.fields.length === 0 && (
            <p className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13.5px] text-muted">No fields yet. People need at least one thing to fill in.</p>
          )}
          <SortableList
            ids={form.fields.map((f) => f.id)}
            onDragStart={() => setOpen(null)}
            onReorder={(next) => {
              const byId = new Map(form.fields.map((f) => [f.id, f]));
              change({ fields: next.map((id) => byId.get(id)!).filter(Boolean) });
            }}
          >
          {form.fields.map((f, i) => (
            <SortableItem key={f.id} id={f.id}>
              {({ handle }) => (
            <FieldCard
              handle={handle}
              field={f}
              index={i}
              count={form.fields.length}
              open={open === f.id}
              onToggle={() => setOpen(open === f.id ? null : f.id)}
              onChange={(patch) => setField(f.id, patch)}
              onMove={(dir) => moveField(f.id, dir)}
              onRemove={() => removeField(f.id)}
            />
              )}
            </SortableItem>
          ))}
          </SortableList>
          <Button type="button" variant="quiet" className="w-full" onClick={() => setAdding(true)}>
            + Add field
          </Button>
        </section>

        <Label className="mt-9">When they send it</Label>
        <div className="space-y-5 rounded-card border border-line bg-surface p-4">
          <FieldRow label="Button text" htmlFor="form-button">
            <Input id="form-button" data-field="buttonText" value={form.buttonText} maxLength={40} onChange={(e) => change({ buttonText: e.target.value })} />
          </FieldRow>
          <FieldRow label="Message after sending" htmlFor="form-after" hint="Replaces the form on the page once it's sent. Curly brackets pull in what they answered: {name}, or any field by its label.">
            <Textarea id="form-after" data-field="afterMessage" value={form.afterMessage} rows={3} maxLength={600} onChange={(e) => change({ afterMessage: e.target.value })} />
          </FieldRow>
          <FieldRow label="Send submissions to" htmlFor="form-notify" hint="Email addresses, separated by commas. Leave empty and every owner gets them.">
            <Input id="form-notify" data-field="notifyEmails" value={form.notifyEmails} maxLength={600} inputMode="email" autoComplete="off" onChange={(e) => change({ notifyEmails: e.target.value })} />
          </FieldRow>
          <Switch
            checked={form.autoReply}
            onChange={(v) => change({ autoReply: v })}
            label="Reply to them straight away"
            hint="An email that goes out the moment they send it, so they know it arrived. Needs an Email field."
          />
          {form.autoReply && (
            <div className="space-y-4 rounded-card border border-line-soft bg-sunken p-4">
              <FieldRow label="Subject" htmlFor="form-reply-subject">
                <Input id="form-reply-subject" data-field="replySubject" value={form.replySubject} maxLength={200} placeholder="Thanks {name}, I have your message" onChange={(e) => change({ replySubject: e.target.value })} />
              </FieldRow>
              <FieldRow label="Message" htmlFor="form-reply-message">
                <Textarea id="form-reply-message" data-field="replyMessage" value={form.replyMessage} rows={6} maxLength={5000} placeholder={"Hi {name},\n\nThanks for getting in touch. I answer everything myself, usually within two days."} onChange={(e) => change({ replyMessage: e.target.value })} />
              </FieldRow>
              <div>
                <p className="text-[12.5px] text-muted">Fill-ins you can use</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {fillIns(form.fields).map((f) => (
                    <span key={f} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-body">
                      {f}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted">Any field by its label, in curly brackets. Works in the message on screen too.</p>
              </div>
            </div>
          )}
          <Switch
            checked={form.createContact}
            onChange={(v) => change({ createContact: v })}
            label="Also create a contact"
            hint="Anyone who sends it with an email address turns up under Contacts. Leave off for a newsletter signup."
          />
        </div>

        <Label className="mt-9">Form settings</Label>
        <form action={deleteAction} className="rounded-card border border-line bg-surface p-4">
          <input type="hidden" name="formId" value={formId} />
          <Button type="submit" variant="danger" size="sm">
            Delete this form
          </Button>
          <p className="mt-2 text-[12.5px] text-muted">Pages that show it go blank there. Everything already sent stays in your inbox.</p>
        </form>
      </div>

      {adding && (
        <Sheet title="Add a field" onClose={() => setAdding(false)}>
          <ul className="space-y-2">
            {FIELD_TYPE_LIST.map((t) => (
              <li key={t}>
                <button type="button" onClick={() => addField(t)} className="flex w-full items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 text-left hover:bg-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{FIELD_TYPES[t].label}</span>
                    <span className="block text-[12.5px] text-muted">{FIELD_TYPES[t].description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/** One field: folded to its label and kind; open to edit it. */
function FieldCard({
  handle,
  field,
  index,
  count,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  handle: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref: (el: HTMLElement | null) => void };
  field: Field;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Field>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const id = `field-${field.id}`;
  return (
    <div data-testid={`field-${index}`} data-field={`fields.${index}`} className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-1 pr-2">
        <button type="button" {...handle} className="flex h-11 w-10 flex-none cursor-grab touch-none items-center justify-center rounded-button text-faint hover:bg-hover hover:text-text active:cursor-grabbing">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M5 9h14M5 15h14" />
          </svg>
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pr-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{field.label || "Untitled field"}</span>
            <span className="block text-[12.5px] text-muted">{fieldSummary(field)}</span>
          </span>
        </button>
        <div className="relative">
          <button type="button" aria-label="Field menu" aria-haspopup="menu" onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text">
            ⋮
          </button>
          {menu && (
            <>
              <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
              <div role="menu" className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-[0_8px_24px_var(--shadow)]">
                <MenuItem disabled={index === 0} onClick={() => (setMenu(false), onMove(-1))}>
                  Move up
                </MenuItem>
                <MenuItem disabled={index === count - 1} onClick={() => (setMenu(false), onMove(1))}>
                  Move down
                </MenuItem>
                <MenuItem danger onClick={() => (setMenu(false), onRemove())}>
                  Delete field
                </MenuItem>
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={onToggle} aria-label={open ? "Fold" : "Open"} className="flex h-10 w-10 items-center justify-center text-faint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={open ? "rotate-180" : ""} aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-line-soft px-4 pb-4 pt-4">
          <FieldRow label="Label" htmlFor={`${id}-label`}>
            <Input id={`${id}-label`} data-field={`fields.${index}.label`} value={field.label} maxLength={120} onChange={(e) => onChange({ label: e.target.value })} />
          </FieldRow>
          <FieldRow label="Type" htmlFor={`${id}-type`}>
            <Select id={`${id}-type`} value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType, options: e.target.value === "choice" && field.options.length === 0 ? ["Option 1", "Option 2"] : field.options })}>
              {FIELD_TYPE_LIST.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPES[t].label}
                </option>
              ))}
            </Select>
          </FieldRow>
          {field.type === "choice" && (
            <div>
              <p className="mb-1.5 text-[13.5px] text-body">Options</p>
              <div className="space-y-2">
                {field.options.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label={`Option ${i + 1}`} data-field={`fields.${index}.options.${i}`} value={o} maxLength={80} onChange={(e) => onChange({ options: field.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <Button type="button" variant="quiet" size="md" aria-label={`Remove option ${i + 1}`} onClick={() => onChange({ options: field.options.filter((_, j) => j !== i) })}>
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="quiet" size="sm" className="mt-2" onClick={() => onChange({ options: [...field.options, ""] })}>
                Add option
              </Button>
            </div>
          )}
          <FieldRow label="Help text" htmlFor={`${id}-help`} hint="Shows under the box. Optional.">
            <Input id={`${id}-help`} data-field={`fields.${index}.help`} value={field.help} maxLength={200} onChange={(e) => onChange({ help: e.target.value })} />
          </FieldRow>
          <Switch checked={field.required} onChange={(v) => onChange({ required: v })} label="Required" hint="They can't send without answering." />
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={`block w-full px-4 py-2.5 text-left text-[14px] hover:bg-hover disabled:opacity-40 ${danger ? "text-alert" : "text-text"}`}>
      {children}
    </button>
  );
}
