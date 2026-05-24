"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DetailModal from "@/components/modal/DetailModal";
import {
  useGmailAccounts,
  useGmailAuthorizeUrl,
  useGmailContacts,
  useGmailDrive,
  useGmailMessage,
  useGmailMessages,
  useMarkGmailRead,
  useMarkGmailUnread,
  useRemoveGmailAccount,
  useSendGmailMessage,
  useStarGmailMessage,
  useSyncGmailAccount,
  useUnstarGmailMessage,
} from "@/hooks/useGmail";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDate, formatDateTime } from "@/utils/i18n-date";
import {
  BiPlus,
  BiTrash,
  BiRefresh,
  BiEnvelope,
  BiSend,
  BiStar,
  BiSolidStar,
  BiPaperclip,
  BiUser,
  BiCloud,
  BiLinkExternal,
} from "react-icons/bi";

function hasLabel(labels: string | null | undefined, label: string): boolean {
  return !!labels && labels.split(",").includes(label);
}

function ContactsModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: contacts = [], isLoading, isError } = useGmailContacts(accountId);
  return (
    <DetailModal isOpen onClose={onClose} title={t("gmail.contactsTitle")}>
      {isLoading ? (
        <p className="text-sm text-gray-400">{t("common.loading")}</p>
      ) : isError ? (
        <p className="text-sm text-gray-400">{t("gmail.googleReconnect")}</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-gray-400">{t("gmail.noContacts")}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                <BiUser size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800 dark:text-white/90">
                  {c.name ?? c.email ?? "—"}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailModal>
  );
}

function DriveModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: files = [], isLoading, isError } = useGmailDrive(accountId);
  return (
    <DetailModal isOpen onClose={onClose} title={t("gmail.driveTitle")}>
      {isLoading ? (
        <p className="text-sm text-gray-400">{t("common.loading")}</p>
      ) : isError ? (
        <p className="text-sm text-gray-400">{t("gmail.googleReconnect")}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-400">{t("gmail.noFiles")}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                {f.iconLink ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.iconLink} alt="" className="h-4 w-4" />
                ) : (
                  <BiCloud size={16} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800 dark:text-white/90">{f.name}</p>
                {f.modifiedTime && (
                  <p className="truncate text-xs text-gray-400">
                    {formatDateTime(f.modifiedTime)}
                  </p>
                )}
              </div>
              {f.webViewLink && (
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded p-1 text-gray-400 hover:text-brand-500"
                  aria-label={t("common.openFull")}
                >
                  <BiLinkExternal size={16} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailModal>
  );
}

function ComposeModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const send = useSendGmailMessage();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim()) return;
    try {
      await send.mutateAsync({
        accountId,
        body: {
          to: to.trim(),
          cc: cc.trim() || null,
          bcc: bcc.trim() || null,
          subject: subject.trim(),
          body,
          html,
        },
      });
      onClose();
      showAlert({
        title: t("gmail.sentTitle"),
        message: t("gmail.sentMessage"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-xl rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("gmail.modal.kicker", "Yeni e-posta")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("gmail.newMessage")}
          </h3>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("gmail.to")}
            </span>
            <input
              autoFocus
              required
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t("gmail.to")}
              className="husrev-input"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="husrev-kicker text-gray-600 dark:text-gray-300">
                {t("gmail.cc")}
              </span>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder={t("gmail.cc")}
                className="husrev-input"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="husrev-kicker text-gray-600 dark:text-gray-300">
                {t("gmail.bcc")}
              </span>
              <input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder={t("gmail.bcc")}
                className="husrev-input"
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("gmail.subject")}
            </span>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("gmail.subject")}
              className="husrev-input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("gmail.body")}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={t("gmail.body")}
              className="husrev-input resize-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={html}
              onChange={(e) => setHtml(e.target.checked)}
              className="h-4 w-4 rounded border-husrev-sand text-husrev-ember focus:ring-husrev-amber"
            />
            {t("gmail.sendAsHtml")}
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={send.isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!to.trim() || !subject.trim() || send.isPending}
            className="husrev-btn"
          >
            <BiSend className="h-4 w-4" />
            {send.isPending ? t("common.saving", "Gönderiliyor…") : t("gmail.send")}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageDetail({ accountId, mid }: { accountId: number; mid: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useGmailMessage(accountId, mid);
  const star = useStarGmailMessage();
  const unstar = useUnstarGmailMessage();

  if (isLoading) {
    return <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>;
  }
  if (!data) return null;

  const starred = data.labels.includes("STARRED");

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {data.subject ?? t("gmail.noSubject")}
        </h3>
        <button
          onClick={() =>
            (starred ? unstar : star).mutate({ accountId, mid })
          }
          className="shrink-0 text-gray-300 transition hover:text-amber-500"
          aria-label={t("gmail.star")}
        >
          {starred ? (
            <BiSolidStar size={18} className="text-amber-500" />
          ) : (
            <BiStar size={18} />
          )}
        </button>
      </div>
      <div className="space-y-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {data.fromAddr && (
          <div>
            <span className="font-medium">{t("gmail.fromLabel")}</span> {data.fromAddr}
          </div>
        )}
        {data.toAddr && (
          <div>
            <span className="font-medium">{t("gmail.toLabel")}</span> {data.toAddr}
          </div>
        )}
        {data.receivedAt && (
          <div>
            <span className="font-medium">{t("gmail.dateLabel")}</span>{" "}
            {formatDateTime(data.receivedAt)}
          </div>
        )}
      </div>
      {data.bodyHtml ? (
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
        />
      ) : data.bodyText ? (
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {data.bodyText}
        </pre>
      ) : (
        <p className="text-sm text-gray-400">{t("gmail.noBody")}</p>
      )}
    </div>
  );
}

export default function GmailPage() {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: accounts = [], isLoading: accountsLoading } = useGmailAccounts();
  const removeAccount = useRemoveGmailAccount();
  const syncAccount = useSyncGmailAccount();
  const authorizeUrl = useGmailAuthorizeUrl();
  const markRead = useMarkGmailRead();

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedMid, setSelectedMid] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showDrive, setShowDrive] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      showAlert({
        title: t("gmail.connectedTitle"),
        message: t("gmail.connectedMessage"),
        type: "success",
        position: "top-center",
      });
      router.replace("/gmail");
    } else if (error) {
      showAlert({
        title: t("common.error"),
        message: decodeURIComponent(error),
        type: "error",
        position: "top-center",
      });
      router.replace("/gmail");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === null) {
      setSelectedAccountId(Number(accounts[0].id));
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = accounts.find((a) => Number(a.id) === selectedAccountId);
  const needsReconnect =
    !!selectedAccount && !(selectedAccount.scopes ?? "").includes("calendar");

  const messagesQuery = useGmailMessages(selectedAccountId ?? 0);

  const handleAddAccount = async (provider: "google" | "microsoft") => {
    try {
      const res = await authorizeUrl.mutateAsync(provider);
      window.location.href = res.data.url;
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleRemoveAccount = async (id: number) => {
    try {
      await removeAccount.mutateAsync(id);
      if (selectedAccountId === Number(id)) setSelectedAccountId(null);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleSync = async () => {
    if (!selectedAccountId) return;
    try {
      await syncAccount.mutateAsync(selectedAccountId);
      showAlert({
        title: t("gmail.syncedTitle"),
        message: t("gmail.syncedMessage"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleSelectMessage = (gmailMessageId: string, unread: boolean) => {
    setSelectedMid(gmailMessageId);
    if (unread && selectedAccountId) {
      markRead.mutate({ accountId: selectedAccountId, mid: gmailMessageId });
    }
  };

  const messages = messagesQuery.data?.pages.flatMap((p) => p.data.content) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageBreadcrumb pageTitle={t("gmail.title")} />

      <div className="flex min-h-0 flex-1 gap-4 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
        {/* Sidebar — accounts */}
        <div className="w-60 shrink-0 border-r border-gray-200 p-3 dark:border-gray-700">
          {accountsLoading ? (
            <p className="py-4 text-center text-xs text-gray-400">{t("common.loading")}</p>
          ) : accounts.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">{t("gmail.noAccounts")}</p>
          ) : (
            <ul className="space-y-1">
              {accounts.map((acc) => (
                <li key={acc.id}>
                  <button
                    onClick={() => {
                      setSelectedAccountId(Number(acc.id));
                      setSelectedMid(null);
                    }}
                    className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                      selectedAccountId === Number(acc.id)
                        ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <BiEnvelope size={14} className="shrink-0" />
                    <span className="flex-1 truncate">{acc.email}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-1 text-[9px] font-medium uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      {acc.provider === "microsoft" ? "OUTLOOK" : "GMAIL"}
                    </span>
                    {acc.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] font-medium text-white">
                        {acc.unreadCount}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveAccount(acc.id);
                      }}
                      className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                      aria-label={t("common.delete")}
                    >
                      <BiTrash size={13} />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 space-y-1">
            <button
              onClick={() => handleAddAccount("google")}
              disabled={authorizeUrl.isPending}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-500 transition hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
            >
              <BiPlus size={16} />
              {t("gmail.addGoogle")}
            </button>
            <button
              onClick={() => handleAddAccount("microsoft")}
              disabled={authorizeUrl.isPending}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-500 transition hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
            >
              <BiPlus size={16} />
              {t("gmail.addOutlook")}
            </button>
          </div>
        </div>

        {/* Middle — message list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-3 dark:border-gray-700">
            <button
              onClick={() => setShowCompose(true)}
              disabled={!selectedAccountId}
              className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <BiPlus size={14} /> {t("gmail.compose")}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowContacts(true)}
                disabled={!selectedAccountId}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <BiUser size={14} /> {t("gmail.contacts")}
              </button>
              {selectedAccount?.provider === "google" && (
                <button
                  onClick={() => setShowDrive(true)}
                  disabled={!selectedAccountId}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <BiCloud size={14} /> {t("gmail.drive")}
                </button>
              )}
              <button
                onClick={handleSync}
                disabled={!selectedAccountId || syncAccount.isPending}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <BiRefresh size={14} /> {t("gmail.sync")}
              </button>
            </div>
          </div>
          {needsReconnect && (
            <button
              onClick={() => handleAddAccount(selectedAccount?.provider ?? "google")}
              className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            >
              {t("gmail.googleReconnect")}
            </button>
          )}
          <div className="flex-1 overflow-y-auto">
            {!selectedAccountId ? (
              <p className="p-4 text-center text-sm text-gray-400">{t("gmail.selectAccount")}</p>
            ) : messagesQuery.isLoading ? (
              <p className="p-4 text-center text-sm text-gray-400">{t("common.loading")}</p>
            ) : messages.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-400">{t("gmail.noMessages")}</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {messages.map((m) => (
                  <li key={m.gmailMessageId}>
                    <button
                      onClick={() => handleSelectMessage(m.gmailMessageId, m.unread)}
                      className={`block w-full px-3 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        selectedMid === m.gmailMessageId
                          ? "bg-brand-50/50 dark:bg-brand-500/10"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-xs text-gray-700 dark:text-gray-300 ${
                            m.unread ? "font-bold" : "font-medium"
                          }`}
                        >
                          {m.fromAddr ?? "—"}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400">
                          {hasLabel(m.labels, "STARRED") && (
                            <BiSolidStar size={11} className="text-amber-500" />
                          )}
                          {m.hasAttachment && <BiPaperclip size={11} />}
                          {m.receivedAt && formatDate(m.receivedAt)}
                        </span>
                      </div>
                      <p
                        className={`truncate text-sm text-gray-800 dark:text-white/90 ${
                          m.unread ? "font-semibold" : ""
                        }`}
                      >
                        {m.subject ?? t("gmail.noSubject")}
                      </p>
                      {m.snippet && <p className="truncate text-xs text-gray-400">{m.snippet}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {messagesQuery.hasNextPage && (
              <div className="p-3 text-center">
                <button
                  onClick={() => messagesQuery.fetchNextPage()}
                  disabled={messagesQuery.isFetchingNextPage}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {messagesQuery.isFetchingNextPage ? t("common.loading") : t("gmail.loadMore")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right — message detail */}
        <div className="flex-1 overflow-y-auto p-5">
          {selectedAccountId && selectedMid ? (
            <MessageDetail accountId={selectedAccountId} mid={selectedMid} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              {t("gmail.selectMessage")}
            </div>
          )}
        </div>
      </div>

      {showCompose && selectedAccountId && (
        <ComposeModal accountId={selectedAccountId} onClose={() => setShowCompose(false)} />
      )}

      {showContacts && selectedAccountId && (
        <ContactsModal accountId={selectedAccountId} onClose={() => setShowContacts(false)} />
      )}

      {showDrive && selectedAccountId && (
        <DriveModal accountId={selectedAccountId} onClose={() => setShowDrive(false)} />
      )}
    </div>
  );
}
