"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/modules/orders/actions";

/** Add to cart on a product page. Adds one; the cart is where the number changes. */
export function AddToCart({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setState(await addToCartAction(productId)))}
          className="h-12 rounded-[6px] bg-[var(--accent)] px-7 text-[15px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
        {state.ok && (
          <Link href="/shop/cart" className="text-[14px] underline underline-offset-4">
            Added — view your cart
          </Link>
        )}
      </div>
      {state.error && <p className="mt-2 text-[14px] text-[var(--text-muted)]">{state.error}</p>}
    </div>
  );
}
