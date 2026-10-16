"use client";

import { useEffect, useRef } from "react";
import { showFieldErrors } from "./form-error";

/**
 * Sits beside an error message: outlines the fields it's about and
 * scrolls to the top one. Looks in the enclosing form (or `data-form`
 * block), or the whole screen when there isn't one. Renders nothing.
 */
export function FieldErrors({ fields }: { fields?: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !fields?.length) return;
    return showFieldErrors(el.closest("form, [data-form]") ?? document, fields);
  }, [fields]);
  return <span ref={ref} hidden />;
}
