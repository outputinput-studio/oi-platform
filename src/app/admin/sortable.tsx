"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Drag-to-reorder for a vertical list of cards (sections, form fields),
 * on @dnd-kit. Only the handle starts a drag, so tapping a card still
 * opens it; on a phone a short press-and-hold on the handle picks it up.
 * The handle is a button, so the keyboard works too: focus it, Space,
 * arrows, Space.
 */
export function SortableList({
  ids,
  onReorder,
  onDragStart,
  children,
}: {
  ids: string[];
  onReorder: (next: string[]) => void;
  /** Called as a drag begins: the lists fold their cards so a tall open one doesn't fight the drop. */
  onDragStart?: () => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** One item. `handle` is spread onto the element that starts the drag. */
export function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (p: { handle: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref: (el: HTMLElement | null) => void }; dragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 10 : undefined };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ handle: { ...attributes, ...listeners, ref: setActivatorNodeRef, "aria-label": "Drag to reorder" }, dragging: isDragging })}
    </div>
  );
}
