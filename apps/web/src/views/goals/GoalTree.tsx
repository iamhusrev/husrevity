"use client";

import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BiCheckCircle,
  BiChevronDown,
  BiChevronRight,
  BiEdit,
  BiRevision,
  BiTargetLock,
  BiTrash,
  BiXCircle,
} from "react-icons/bi";
import { GoalResponse, GoalStatus } from "@/types/goal/goal";
import { GoalNode, progressLabel, progressPercent } from "@/utils/goal-tree";
import { formatYmdRange } from "./goal-format";

const STATUS_ICON = {
  active: BiTargetLock,
  done: BiCheckCircle,
  dropped: BiXCircle,
} as const;

const STATUS_STYLE: Record<GoalStatus, string> = {
  active: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  dropped: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

interface FlatEntry {
  id: string;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
}

function flatten(
  nodes: GoalNode[],
  collapsed: Set<string>,
  parentId: string | null,
  out: FlatEntry[],
) {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const expanded = hasChildren && !collapsed.has(node.goal.id);
    out.push({ id: node.goal.id, parentId, hasChildren, expanded });
    if (expanded) flatten(node.children, collapsed, node.goal.id, out);
  }
}

export interface GoalTreeProps {
  nodes: GoalNode[];
  busy: boolean;
  onOpen: (goal: GoalResponse) => void;
  onEdit: (goal: GoalResponse) => void;
  onSetStatus: (goal: GoalResponse, status: GoalStatus) => void;
  onDelete: (goal: GoalResponse) => void;
}

export default function GoalTree({
  nodes,
  busy,
  onOpen,
  onEdit,
  onSetStatus,
  onDelete,
}: GoalTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const flat = useMemo(() => {
    const out: FlatEntry[] = [];
    flatten(nodes, collapsed, null, out);
    return out;
  }, [nodes, collapsed]);

  const tabStopId =
    focusedId && flat.some((e) => e.id === focusedId) ? focusedId : (flat[0]?.id ?? null);

  const setExpanded = (id: string, expanded: boolean) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (expanded) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusItem = (id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, node: GoalNode) => {
    // Keys pressed on an action button or a nested item are theirs, not this item's.
    if (e.target !== e.currentTarget) return;
    const idx = flat.findIndex((f) => f.id === node.goal.id);
    const entry = flat[idx];
    if (!entry) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(flat[idx + 1]?.id);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(flat[idx - 1]?.id);
        break;
      case "Home":
        e.preventDefault();
        focusItem(flat[0]?.id);
        break;
      case "End":
        e.preventDefault();
        focusItem(flat[flat.length - 1]?.id);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (entry.hasChildren && !entry.expanded) setExpanded(entry.id, true);
        else if (entry.hasChildren) focusItem(flat[idx + 1]?.id);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (entry.hasChildren && entry.expanded) setExpanded(entry.id, false);
        else if (entry.parentId) focusItem(entry.parentId);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onOpen(node.goal);
        break;
      default:
    }
  };

  const renderNodes = (list: GoalNode[], level: number): React.ReactNode =>
    list.map((node) => (
      <GoalTreeItem
        key={node.goal.id}
        node={node}
        level={level}
        busy={busy}
        collapsed={collapsed}
        tabStopId={tabStopId}
        registerRef={(id, el) => {
          if (el) itemRefs.current.set(id, el);
          else itemRefs.current.delete(id);
        }}
        onFocusItem={setFocusedId}
        onKeyDown={handleKeyDown}
        onToggle={(id, expanded) => setExpanded(id, expanded)}
        onOpen={onOpen}
        onEdit={onEdit}
        onSetStatus={onSetStatus}
        onDelete={onDelete}
        renderChildren={(children) => renderNodes(children, level + 1)}
      />
    ));

  return (
    <ul role="tree" className="m-0 list-none space-y-2 p-0">
      {renderNodes(nodes, 1)}
    </ul>
  );
}

interface GoalTreeItemProps {
  node: GoalNode;
  level: number;
  busy: boolean;
  collapsed: Set<string>;
  tabStopId: string | null;
  registerRef: (id: string, el: HTMLLIElement | null) => void;
  onFocusItem: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, node: GoalNode) => void;
  onToggle: (id: string, expanded: boolean) => void;
  onOpen: (goal: GoalResponse) => void;
  onEdit: (goal: GoalResponse) => void;
  onSetStatus: (goal: GoalResponse, status: GoalStatus) => void;
  onDelete: (goal: GoalResponse) => void;
  renderChildren: (children: GoalNode[]) => React.ReactNode;
}

function GoalTreeItem({
  node,
  level,
  busy,
  collapsed,
  tabStopId,
  registerRef,
  onFocusItem,
  onKeyDown,
  onToggle,
  onOpen,
  onEdit,
  onSetStatus,
  onDelete,
  renderChildren,
}: GoalTreeItemProps) {
  const { t, i18n } = useTranslation();
  const { goal } = node;
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsed.has(goal.id);
  const StatusIcon = STATUS_ICON[goal.status];
  const pct = progressPercent(goal.progress);
  const label = progressLabel(goal.progress);
  // progressLabel renders an empty goal as a dash, which a screen reader would read as nothing.
  const valueText = goal.progress.total > 0 ? label : t("goals.noWorkYet");
  const titleId = `goal-title-${goal.id}`;

  return (
    <li
      ref={(el) => registerRef(goal.id, el)}
      role="treeitem"
      aria-level={level}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-labelledby={titleId}
      tabIndex={tabStopId === goal.id ? 0 : -1}
      data-testid={`goal-node-${goal.id}`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusItem(goal.id);
      }}
      onKeyDown={(e) => onKeyDown(e, node)}
      className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-white/[0.04] dark:bg-husrev-shadow">
        <div className="flex flex-wrap items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${t(expanded ? "goals.collapse" : "goals.expand")}: ${goal.title}`}
              onClick={() => onToggle(goal.id, !expanded)}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer"
            >
              {expanded ? <BiChevronDown size={18} /> : <BiChevronRight size={18} />}
            </button>
          ) : (
            <span className="inline-block w-[26px]" aria-hidden="true" />
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={() => onOpen(goal)}
            className="min-w-0 flex-1 text-left cursor-pointer"
          >
            <span
              id={titleId}
              className="block truncate text-sm font-semibold text-gray-900 dark:text-white"
            >
              {goal.title}
            </span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {t(`goals.horizon.${goal.horizon}`)} ·{" "}
              {formatYmdRange(goal.periodStart, goal.periodEnd, i18n.language || "tr")}
            </span>
          </button>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[goal.status]}`}
          >
            <StatusIcon size={14} aria-hidden="true" />
            {t(`goals.status.${goal.status}`)}
          </span>

          <div
            role="group"
            aria-label={t("goals.actionsFor", { title: goal.title })}
            className="flex shrink-0 items-center gap-1"
          >
            <button
              type="button"
              disabled={busy}
              aria-label={`${t("goals.edit")}: ${goal.title}`}
              onClick={() => onEdit(goal)}
              className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
            >
              <BiEdit size={18} />
            </button>
            {goal.status === "active" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${t("goals.markDone")}: ${goal.title}`}
                  onClick={() => onSetStatus(goal, "done")}
                  className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                >
                  <BiCheckCircle size={18} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${t("goals.drop")}: ${goal.title}`}
                  onClick={() => onSetStatus(goal, "dropped")}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
                >
                  <BiXCircle size={18} />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                aria-label={`${t("goals.reopen")}: ${goal.title}`}
                onClick={() => onSetStatus(goal, "active")}
                className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-950/30 cursor-pointer"
              >
                <BiRevision size={18} />
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              aria-label={`${t("goals.delete")}: ${goal.title}`}
              onClick={() => onDelete(goal)}
              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <BiTrash size={18} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={t("goals.progressFor", { title: goal.title })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={valueText}
            className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
          >
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">
            {label}
          </span>
        </div>
      </div>

      {hasChildren && expanded && (
        <ul role="group" className="m-0 mt-2 list-none space-y-2 p-0 pl-4 sm:pl-6">
          {renderChildren(node.children)}
        </ul>
      )}
    </li>
  );
}
