"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useAiConversations,
  useAiMessages,
  useCreateAiConversation,
  useDeleteAiConversation,
  useRenameAiConversation,
  useSendAiMessage,
} from "@/hooks/useAi";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { BiPlus, BiTrash, BiSend, BiPencil, BiCheck, BiX } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";

export default function AiPage() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);

  const { data: conversations = [], isLoading } = useAiConversations();
  const createConv = useCreateAiConversation();
  const deleteConv = useDeleteAiConversation();
  const renameConv = useRenameAiConversation();
  const sendMessage = useSendAiMessage();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useAiMessages(selectedId ?? 0);

  useEffect(() => {
    if (conversations.length > 0 && selectedId === null) {
      setSelectedId(Number(conversations[0].id));
    }
  }, [conversations, selectedId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const handleNew = async () => {
    try {
      const res = await createConv.mutateAsync(undefined);
      setSelectedId(Number(res.data.id));
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteConv.mutateAsync(id);
      if (selectedId === Number(id)) setSelectedId(null);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const startRename = (id: number, currentTitle: string) => {
    setRenamingId(id);
    setRenameDraft(currentTitle);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const commitRename = async () => {
    if (renamingId === null) return;
    const next = renameDraft.trim();
    if (!next) {
      cancelRename();
      return;
    }
    try {
      await renameConv.mutateAsync({ id: renamingId, title: next });
      cancelRename();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    let convId = selectedId;
    try {
      if (convId === null) {
        const res = await createConv.mutateAsync(content.slice(0, 60));
        convId = Number(res.data.id);
        setSelectedId(convId);
      }
      setInput("");
      await sendMessage.mutateAsync({ conversationId: convId, content });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageBreadcrumb pageTitle={t("ai.title")} />

      <div className="flex min-h-0 flex-1 gap-4 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
        {/* Conversations */}
        <div className="w-60 shrink-0 border-r border-gray-200 p-3 dark:border-gray-700">
          <button
            onClick={handleNew}
            className="mb-2 flex w-full items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-sm text-white transition hover:bg-brand-600"
          >
            <BiPlus size={16} /> {t("ai.newChat")}
          </button>
          {isLoading ? (
            <p className="py-4 text-center text-xs text-gray-400">{t("common.loading")}</p>
          ) : conversations.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">{t("ai.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => {
                const isEditing = renamingId === Number(c.id);
                return (
                  <li key={c.id}>
                    {isEditing ? (
                      <div className="flex items-center gap-1 rounded-xl bg-husrev-amber/10 px-2 py-1.5 ring-1 ring-husrev-amber/40">
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          maxLength={255}
                          className="flex-1 min-w-0 rounded-md border-0 bg-transparent px-1 py-0.5 text-sm text-husrev-ink outline-none focus:ring-0 dark:text-husrev-cream"
                          placeholder={t("ai.renamePlaceholder", "Sohbet adı")}
                        />
                        <button
                          type="button"
                          onClick={commitRename}
                          disabled={renameConv.isPending || !renameDraft.trim()}
                          aria-label={t("common.save", "Kaydet")}
                          className="shrink-0 rounded p-1 text-husrev-ember hover:bg-husrev-amber/20 disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
                        >
                          <BiCheck size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={renameConv.isPending}
                          aria-label={t("common.cancel", "İptal")}
                          className="shrink-0 rounded p-1 text-gray-500 hover:bg-husrev-sand/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber"
                        >
                          <BiX size={14} />
                        </button>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(Number(c.id))}
                        onDoubleClick={() => startRename(Number(c.id), c.title)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(Number(c.id));
                          }
                        }}
                        className={`group flex w-full cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-husrev-amber ${
                          selectedId === Number(c.id)
                            ? "bg-husrev-amber/15 font-medium text-husrev-ember dark:bg-husrev-amber/10 dark:text-husrev-amber"
                            : "text-gray-700 hover:bg-husrev-sand/40 dark:text-gray-300 dark:hover:bg-white/5"
                        }`}
                        title={t("ai.doubleClickToRename", "Yeniden adlandırmak için çift tıkla")}
                      >
                        <span className="flex-1 truncate">{c.title}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(Number(c.id), c.title);
                          }}
                          className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-colors duration-200 group-hover:opacity-100 hover:text-husrev-ember focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-husrev-amber"
                          aria-label={t("common.rename", "Yeniden adlandır")}
                        >
                          <BiPencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-colors duration-200 group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          aria-label={t("common.delete")}
                        >
                          <BiTrash size={13} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className="flex flex-1 flex-col">
          <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {selectedId === null ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
                <HiSparkles size={28} className="text-husrev-amber" />
                <p className="text-sm">{t("ai.startHint")}</p>
              </div>
            ) : messagesLoading ? (
              <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400">{t("ai.startHint")}</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {sendMessage.isPending && (
              <p className="text-center text-xs text-gray-400">{t("ai.thinking")}</p>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-700"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("ai.placeholder")}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="submit"
              disabled={!input.trim() || sendMessage.isPending}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              <BiSend size={14} /> {t("ai.send")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
