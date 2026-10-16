"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveMenuAction } from "@/modules/menus/actions";
import { describeLink, itemLabel, itemSummary, newItemId, normaliseDepths, type LinkTargets, type MenuItem, type MenuLink } from "@/modules/menus/items";
import type { MenuKind } from "@/db/schema";
import { Button, Field, Input, Label, PageHeader, Switch } from "../../../ui";
import { SortableItem, SortableList } from "../../../sortable";
import { LinkPicker } from "./link-picker";

type Settings = { name: string; items: MenuItem[] };

/** How far right (in px) a drop has to land to tuck an item under the one above. */
const INDENT_PX = 36;

/**
 * The menu editor, as in design/admin.html: the name, then the items as
 * folding cards. Drag to reorder; drag right to tuck an item under the
 * one above (one level, no deeper), or use the switch inside it. Each
 * item says where it goes, and says so loudly when that's gone. Saves a
 * moment after every change.
 */
export function MenuEditor({
  menuKey,
  kind,
  automatic,
  initial,
  targets,
  deleteAction,
  resetAction,
}: {
  menuKey: string;
  kind: MenuKind;
  automatic: boolean;
  initial: Settings;
  targets: LinkTargets;
  deleteAction: (form: FormData) => Promise<void>;
  resetAction: () => Promise<void>;
}) {
  const [menu, setMenu] = useState<Settings>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  /** The picker: adding a new item, or changing where one goes. */
  const [picking, setPicking] = useState<{ for: "new" } | { for: string } | null>(null);
  const [isAutomatic, setIsAutomatic] = useState(automatic);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (snapshot: Settings) => {
      setStatus("saving");
      try {
        const r = await saveMenuAction(menuKey, snapshot);
        if (r.error) {
          setError(r.error);
          setStatus("error");
        } else {
          setStatus("saved");
          setIsAutomatic(false);
        }
      } catch {
        setError("couldn't reach the server");
        setStatus("error");
      }
    },
    [menuKey],
  );
  const change = (patch: Partial<Settings>) => {
    const next = { ...menu, ...patch };
    next.items = normaliseDepths(next.items);
    setMenu(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setItem = (id: string, patch: Partial<MenuItem>) => change({ items: menu.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const removeItem = (id: string) => change({ items: menu.items.filter((i) => i.id !== id) });

  const onDrop = ({ id, order, dx }: { id: string; order: string[]; dx: number }) => {
    const byId = new Map(menu.items.map((i) => [i.id, i]));
    const next = order.map((x) => byId.get(x)!).filter(Boolean);
    const at = next.findIndex((i) => i.id === id);
    if (at >= 0 && dx > INDENT_PX && at > 0) next[at] = { ...next[at], depth: 1 };
    if (at >= 0 && dx < -INDENT_PX) next[at] = { ...next[at], depth: 0 };
    const moved = next.some((i, k) => i !== menu.items[k]);
    if (moved) change({ items: next });
  };

  const pick = (link: MenuLink, title: string) => {
    if (picking?.for === "new") {
      const item: MenuItem = { id: newItemId(), label: title, link, depth: 0 };
      change({ items: [...menu.items, item] });
      setOpen(item.id);
    } else if (picking) setItem(picking.for, { link });
    setPicking(null);
  };

  /** The depth-0 item an item would sit under. */
  const parentOf = (index: number) => {
    for (let k = index - 1; k >= 0; k--) if (menu.items[k].depth === 0) return menu.items[k];
    return null;
  };

  const fixedName = kind !== "custom";

  return (
    <>
      <PageHeader
        title="Edit menu"
        back="/menus"
        actions={
          <span data-testid="menu-save-status" className={`text-[13px] ${status === "error" ? "text-alert" : status === "saved" ? "text-success" : "text-muted"}`}>
            {status === "saving" && "Saving…"}
            {status === "saved" && "✓ Saved"}
            {status === "error" && (
              <button type="button" onClick={() => void save(menu)} className="underline underline-offset-4">
                Retry — {error}
              </button>
            )}
          </span>
        }
      />
      <div className="max-w-[640px] pt-5 md:pt-6">
        {isAutomatic && (
          <p data-testid="automatic-note" className="mb-5 rounded-card border border-line bg-sunken px-4 py-3 text-[13px] leading-[1.5] text-body">
            This is the automatic menu: every live page, then Shop and Journal when they have something in them. Change anything and it&apos;s yours — after that, new pages wait for you to add them here.
          </p>
        )}
        <Field label="Menu name" htmlFor="menu-name" hint={fixedName ? "This one always exists, so the name stays." : "The heading of its column in the footer."}>
          <Input id="menu-name" value={menu.name} readOnly={fixedName} maxLength={60} onChange={(e) => change({ name: e.target.value })} />
        </Field>

        <Label className="mt-6" right={menu.items.length > 1 ? "Drag right to indent" : undefined}>
          Items
        </Label>
        <section className="space-y-2" aria-label="Items">
          {menu.items.length === 0 && <p className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13.5px] text-muted">Nothing in this menu yet.</p>}
          <SortableList ids={menu.items.map((i) => i.id)} onDragStart={() => setOpen(null)} onDrop={onDrop}>
            {menu.items.map((item, i) => {
              const d = describeLink(item.link, targets);
              const parent = parentOf(i);
              return (
                <SortableItem key={item.id} id={item.id}>
                  {({ handle }) => (
                    <div data-testid={`item-${i}`} className={`rounded-card border border-line bg-surface ${item.depth === 1 ? "ml-7" : ""}`}>
                      <div className="flex items-center pr-2">
                        <button type="button" {...handle} className="flex h-11 w-10 flex-none cursor-grab touch-none items-center justify-center rounded-button text-faint hover:bg-hover hover:text-text active:cursor-grabbing">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                            <path d="M5 9h14M5 15h14" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id} className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 text-left">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium">{itemLabel(item, d)}</span>
                            <span className={`block truncate text-[12.5px] ${d.problem === "gone" ? "text-alert" : d.problem === "notLive" ? "text-warning" : "text-muted"}`}>{itemSummary(d)}</span>
                          </span>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`flex-none text-faint ${open === item.id ? "rotate-180" : ""}`} aria-hidden>
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                      {open === item.id && (
                        <div className="space-y-4 border-t border-line-soft px-4 pb-4 pt-4">
                          <Field label="Label" htmlFor={`item-${item.id}-label`} hint="Leave empty to use the title of what it links to.">
                            <Input id={`item-${item.id}-label`} value={item.label} maxLength={80} placeholder={d.title} onChange={(e) => setItem(item.id, { label: e.target.value })} />
                          </Field>
                          <div>
                            <p className="mb-1.5 text-[13.5px] text-body">Links to</p>
                            <button type="button" onClick={() => setPicking({ for: item.id })} className="flex w-full items-center gap-3 rounded-button border border-control px-3.5 py-2.5 text-left hover:border-accent">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14.5px]">{d.title || "Nothing"}</span>
                                <span className={`block truncate text-[12px] ${d.problem === "gone" ? "text-alert" : "text-muted"}`}>{itemSummary(d)}</span>
                              </span>
                              <span className="text-[13px] text-accent-text">Change</span>
                            </button>
                          </div>
                          {i > 0 && (
                            <Switch
                              checked={item.depth === 1}
                              onChange={(v) => setItem(item.id, { depth: v ? 1 : 0 })}
                              label={parent ? `Sits under ${itemLabel(parent, describeLink(parent.link, targets)).toLowerCase()}` : "Sits under the one above"}
                              hint="One level of nesting is the limit."
                            />
                          )}
                          <button type="button" onClick={() => removeItem(item.id)} className="text-[13.5px] text-alert hover:underline">
                            Remove item
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </SortableList>
          <button
            type="button"
            onClick={() => setPicking({ for: "new" })}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-accent text-[14.5px] text-text hover:bg-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M12 5v14" />
            </svg>
            Add item
          </button>
          <p className="text-[12.5px] leading-[1.5] text-muted">On a phone, an item with children shows a marker and opens them in place. On a computer they drop down.</p>
        </section>

        {kind === "header" && !isAutomatic && (
          <>
            <Label className="mt-9">Menu settings</Label>
            <form action={resetAction} className="rounded-card border border-line bg-surface p-4">
              <Button type="submit" variant="quiet" size="sm">
                Back to automatic
              </Button>
              <p className="mt-2 text-[12.5px] text-muted">Every live page, then Shop and Journal — and new pages join by themselves again. What&apos;s here now is thrown away.</p>
            </form>
          </>
        )}
        {kind === "custom" && (
          <>
            <Label className="mt-9">Menu settings</Label>
            <form action={deleteAction} className="rounded-card border border-line bg-surface p-4">
              <input type="hidden" name="key" value={menuKey} />
              <Button type="submit" variant="danger" size="sm">
                Delete this menu
              </Button>
              <p className="mt-2 text-[12.5px] text-muted">Its column leaves the footer. The pages it pointed at stay as they are.</p>
            </form>
          </>
        )}
      </div>

      {picking && <LinkPicker targets={targets} onPick={pick} onClose={() => setPicking(null)} />}
    </>
  );
}
