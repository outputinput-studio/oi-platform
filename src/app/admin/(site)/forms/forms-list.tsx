"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reorderFormsAction } from "@/modules/forms/actions";
import { Card, Notice } from "../../ui";
import { SortableItem, SortableList } from "../../sortable";

export type FormCard = { id: string; name: string; newCount: number; summary: string };

/** The forms as draggable cards: the order is the team's own, saved as they drop. */
export function FormsList({ forms }: { forms: FormCard[] }) {
  const [order, setOrder] = useState(() => forms.map((f) => f.id));
  const [error, setError] = useState("");
  const serverOrder = forms.map((f) => f.id).join(",");
  const last = useRef(serverOrder);
  useEffect(() => {
    if (last.current !== serverOrder) {
      last.current = serverOrder;
      setOrder(forms.map((f) => f.id));
    }
  }, [serverOrder, forms]);
  const byId = new Map(forms.map((f) => [f.id, f]));

  const reorder = async (next: string[]) => {
    const before = order;
    setOrder(next);
    setError("");
    const r = await reorderFormsAction(next).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setOrder(before);
      setError(r.error);
    }
  };

  return (
    <>
      <Notice error={error} />
      <ul className="space-y-2.5">
        <SortableList ids={order} onReorder={(next) => void reorder(next)}>
          {order.map((id) => {
            const f = byId.get(id);
            if (!f) return null;
            return (
              <SortableItem key={f.id} id={f.id}>
                {({ handle }) => (
                  <li data-testid={`form-${f.id}`}>
                    <Card className="flex items-center hover:bg-hover">
                      <button type="button" {...handle} className="flex w-10 flex-none cursor-grab touch-none items-center justify-center self-stretch rounded-l-card text-faint hover:text-text active:cursor-grabbing">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <path d="M5 9h14M5 15h14" />
                        </svg>
                      </button>
                      <Link href={`/forms/${f.id}`} className="block min-w-0 flex-1 py-[14px] pr-[14px]">
                        <div className="flex items-center justify-between gap-2.5">
                          <span className="truncate text-[15px] font-medium">{f.name}</span>
                          {f.newCount > 0 && <span className="rounded-full bg-accent px-2 py-px text-[11px] font-semibold text-text">{f.newCount} new</span>}
                        </div>
                        <p className="mt-1.5 truncate text-[12.5px] text-muted">{f.summary}</p>
                      </Link>
                    </Card>
                  </li>
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      </ul>
    </>
  );
}
