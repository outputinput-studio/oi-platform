"use client";

import { useActionState, useState } from "react";
import { createProductAction, type ProductFormState } from "@/modules/products/actions";
import { Button, Field, Input, Notice, Select, Sheet } from "../../ui";
import { keepValues } from "../../../keep-values";

/** "Add product": a name (and a category, if there are any), then straight into the editor. */
export function AddProduct({ categories, defaultCategory }: { categories: { id: string; name: string }[]; defaultCategory?: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(createProductAction, {} as ProductFormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add product
      </Button>
      {open && (
        <Sheet title="Add a product" onClose={() => setOpen(false)}>
          <form onSubmit={keepValues(act)} className="space-y-4">
            <Field label="Product name" htmlFor="new-product-name" hint="What it's called on your site. You can change it later.">
              <Input id="new-product-name" name="name" required maxLength={160} autoFocus />
            </Field>
            {categories.length > 0 && (
              <Field label="Category" htmlFor="new-product-category">
                <Select id="new-product-category" name="categoryId" defaultValue={defaultCategory ?? ""}>
                  <option value="">None yet</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <p className="text-[12.5px] text-muted">It starts hidden, so you can add photos and a price before anyone sees it.</p>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Create product"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}
