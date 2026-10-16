"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCategoryAction, deleteCategoryAction, reorderCategoriesAction, updateCategoryAction, type FormState } from "@/modules/articles/actions";
import { slugFromTitle } from "@/modules/pages/slug";
import { Button, Card, Field, Input, Notice, Sheet, Textarea } from "../../../ui";
import { SortableItem, SortableList } from "../../../sortable";

export type CategoryCard = { id: string; name: string; slug: string; description: string; articleCount: number };

/** "Add category": name, with the address suggested from it. */
export function AddCategory() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await createCategoryAction(prev, form);
    if (r.ok) {
      setOpen(false);
      setName("");
      setSlug("");
      setTouched(false);
    }
    return r;
  }, {} as FormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add category
      </Button>
      {open && (
        <Sheet title="Add a category" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="Name" htmlFor="c-name">
              <Input
                id="c-name"
                name="name"
                value={name}
                required
                maxLength={80}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (!touched) setSlug(slugFromTitle(e.target.value));
                }}
              />
            </Field>
            <Field label="Address" htmlFor="c-slug" hint="/journal/… — lower-case words joined by dashes.">
              <Input
                id="c-slug"
                name="slug"
                value={slug}
                maxLength={60}
                className="font-mono"
                onChange={(e) => {
                  setTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </Field>
            <Notice error={state.error} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Add category"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/** The categories, draggable, each opening to edit name, address and description. */
export function CategoryList({ categories, siteHost }: { categories: CategoryCard[]; siteHost: string }) {
  const [order, setOrder] = useState(() => categories.map((c) => c.id));
  const [error, setError] = useState("");
  const serverOrder = categories.map((c) => c.id).join(",");
  const last = useRef(serverOrder);
  useEffect(() => {
    if (last.current !== serverOrder) {
      last.current = serverOrder;
      setOrder(categories.map((c) => c.id));
    }
  }, [serverOrder, categories]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const reorder = async (next: string[]) => {
    const before = order;
    setOrder(next);
    const r = await reorderCategoriesAction(next).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setOrder(before);
      setError(r.error);
    } else setError("");
  };
  return (
    <>
      <Notice error={error} />
      <ul className="space-y-2.5">
        <SortableList ids={order} onReorder={(next) => void reorder(next)}>
          {order.map((id) => {
            const c = byId.get(id);
            return c ? (
              <SortableItem key={c.id} id={c.id}>
                {({ handle }) => <CategoryItem category={c} siteHost={siteHost} handle={handle} />}
              </SortableItem>
            ) : null;
          })}
        </SortableList>
      </ul>
    </>
  );
}

function CategoryItem({ category: c, siteHost, handle }: { category: CategoryCard; siteHost: string; handle: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref: (el: HTMLElement | null) => void } }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await updateCategoryAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, {} as FormState);
  return (
    <li data-testid={`category-${c.slug}`}>
      <Card className="flex items-center">
        <button type="button" {...handle} className="flex w-10 flex-none cursor-grab touch-none items-center justify-center self-stretch rounded-l-card text-faint hover:text-text active:cursor-grabbing">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M5 9h14M5 15h14" />
          </svg>
        </button>
        <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 py-[14px] pr-[14px] text-left hover:bg-hover">
          <span className="block truncate text-[15px] font-medium">{c.name}</span>
          <span className="mt-1 block text-[12.5px] text-muted">
            {c.articleCount} article{c.articleCount === 1 ? "" : "s"}
          </span>
          <span className="mt-1 block truncate font-mono text-[12.5px] text-muted">/journal/{c.slug}</span>
        </button>
      </Card>
      {open && (
        <Sheet title="Edit category" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <input type="hidden" name="categoryId" value={c.id} />
            <Field label="Name" htmlFor={`e-name-${c.id}`}>
              <Input id={`e-name-${c.id}`} name="name" defaultValue={c.name} required maxLength={80} />
            </Field>
            <Field label="Address" htmlFor={`e-slug-${c.id}`} hint={`${siteHost}/journal/… Changing it moves every article in it; old links are redirected.`}>
              <Input id={`e-slug-${c.id}`} name="slug" defaultValue={c.slug} required maxLength={60} className="font-mono" />
            </Field>
            <Field label="Description" htmlFor={`e-desc-${c.id}`} hint="A line under the heading on the category's page. Optional.">
              <Textarea id={`e-desc-${c.id}`} name="description" defaultValue={c.description} rows={2} maxLength={300} />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
          <form action={deleteCategoryAction} className="mt-6 border-t border-line-soft pt-4">
            <input type="hidden" name="categoryId" value={c.id} />
            <Button type="submit" variant="danger" size="sm">
              Delete category
            </Button>
            <p className="mt-2 text-[12.5px] text-muted">Its articles stay; they just lose the category.</p>
          </form>
        </Sheet>
      )}
    </li>
  );
}
