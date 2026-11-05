"use client";

import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { resolveTopicDrop, topicDndId } from "./learning-dnd";
import { useLearningSensors } from "./useLearningSensors";

/**
 * Makes the topic cards inside it sortable. `topicIds` is the visible list in order (the selected
 * year's topics, or all of them); `onReorder` receives that same list in its new order.
 */
export default function SortableTopicGrid({
  topicIds,
  titleOf,
  onReorder,
  children,
}: {
  topicIds: string[];
  titleOf: (id: string) => string;
  onReorder: (orderedIds: string[]) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const sensors = useLearningSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndIds = topicIds.map(topicDndId);

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const next = resolveTopicDrop(topicIds, String(active.id), String(over.id));
    if (next) onReorder(next);
  };
  const activeTitle = activeId
    ? titleOf(topicIds.find((id) => topicDndId(id) === activeId) ?? "")
    : "";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: t(
            "learning.dnd.instructions",
            "To pick up an item, press space or enter. Use the arrow keys to move it, space or enter to drop it, escape to cancel.",
          ),
        },
      }}
    >
      <SortableContext items={dndIds} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId && (
          <div className="rounded-2xl bg-white px-4 py-3 text-base font-semibold text-husrev-ink shadow-card-warm ring-2 ring-husrev-amber dark:bg-husrev-shadow dark:text-husrev-cream">
            {activeTitle}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
