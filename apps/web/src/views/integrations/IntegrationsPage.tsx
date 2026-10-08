"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import {
  ChatProvider,
  PAT_SCOPES,
  PatScope,
  integrationsService,
} from "@/services/integrations-service";

const CARD =
  "rounded-3xl ring-1 ring-husrev-sand/90 bg-white/60 p-5 sm:p-6 dark:bg-husrev-shadow/60 dark:ring-white/[0.06]";
const BTN =
  "rounded-xl px-4 py-2 text-sm font-medium bg-husrev-ink text-husrev-cream hover:bg-husrev-ember disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink";
const BTN_GHOST =
  "rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-husrev-sand hover:bg-husrev-sand/40 disabled:opacity-50 dark:ring-white/10";

function useErrorAlert() {
  const show = alertStore((s) => s.show);
  return (err: unknown) => {
    const { title, message } = parseAxiosError(err);
    show({ title, message, type: "error", position: "top-center" });
  };
}

function ChatLinkCard({ provider }: { provider: ChatProvider }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useErrorAlert();
  const key = ["integrations", provider];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => integrationsService.linkStatus(provider),
  });
  const create = useMutation({
    mutationFn: () => integrationsService.createLinkCode(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError,
  });
  const unlink = useMutation({
    mutationFn: () => integrationsService.unlink(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError,
  });
  // Poll while a code is pending so the card flips to "connected" on its own.
  useEffect(() => {
    if (!data?.pendingCode) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: key }), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pendingCode]);

  const command = data?.pendingCode
    ? provider === "telegram"
      ? `/link ${data.pendingCode}`
      : `link ${data.pendingCode}`
    : null;
  const bot = data?.botUsername
    ? provider === "telegram"
      ? `@${data.botUsername}`
      : data.botUsername
    : "";

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">{t(`integrations.${provider}.title`)}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(`integrations.${provider}.desc`)}
      </p>
      {data && !data.configured ? (
        <p className="mt-4 text-sm text-amber-600">{t("integrations.notConfigured")}</p>
      ) : data?.linked ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-green-600">{t("integrations.connected")}</span>
          <button className={BTN_GHOST} disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            {t("integrations.disconnect")}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {command && (
            <div className="rounded-2xl bg-husrev-sand/40 p-4 dark:bg-white/[0.04]">
              <p className="text-sm">{t(`integrations.${provider}.instruction`, { bot })}</p>
              <code className="mt-2 block select-all text-xl font-mono tracking-wider">
                {command}
              </code>
              <p className="mt-2 text-xs text-gray-500">
                {t("integrations.validUntil", {
                  time: new Date(data!.pendingCodeExpiresAt!).toLocaleTimeString(),
                })}
              </p>
            </div>
          )}
          <button className={BTN} disabled={create.isPending} onClick={() => create.mutate()}>
            {command ? t("integrations.newCode") : t("integrations.generateCode")}
          </button>
        </div>
      )}
    </section>
  );
}

function GoogleCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useErrorAlert();
  const params = useSearchParams();
  const show = alertStore((s) => s.show);
  const { data } = useQuery({
    queryKey: ["integrations", "google"],
    queryFn: integrationsService.googleStatus,
  });
  const disconnect = useMutation({
    mutationFn: integrationsService.googleDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "google"] }),
    onError,
  });
  const connect = useMutation({
    mutationFn: integrationsService.googleConnectUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError,
  });

  const result = params.get("google");
  useEffect(() => {
    if (result === "connected") {
      show({
        title: t("integrations.google.connectedToast"),
        message: "",
        type: "success",
        position: "top-center",
      });
      qc.invalidateQueries({ queryKey: ["integrations", "google"] });
    } else if (result === "error") {
      show({
        title: t("integrations.google.errorToast"),
        message: "",
        type: "error",
        position: "top-center",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">{t("integrations.google.title")}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("integrations.google.desc")}
      </p>
      {data && !data.configured ? (
        <p className="mt-4 text-sm text-amber-600">{t("integrations.notConfigured")}</p>
      ) : data?.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-green-600">{t("integrations.connected")}</span>
          <button
            className={BTN_GHOST}
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {t("integrations.disconnect")}
          </button>
        </div>
      ) : (
        <button
          className={`${BTN} mt-4`}
          disabled={connect.isPending}
          onClick={() => connect.mutate()}
        >
          {t("integrations.google.connect")}
        </button>
      )}
    </section>
  );
}

function McpCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useErrorAlert();
  const [name, setName] = useState("Claude");
  const [scopes, setScopes] = useState<PatScope[]>([...PAT_SCOPES]);
  const [issued, setIssued] = useState<string | null>(null);
  const { data: pats } = useQuery({
    queryKey: ["integrations", "pats"],
    queryFn: integrationsService.listPats,
  });
  const issue = useMutation({
    mutationFn: () => integrationsService.issuePat(name.trim(), scopes),
    onSuccess: (r) => {
      setIssued(r.token);
      qc.invalidateQueries({ queryKey: ["integrations", "pats"] });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: integrationsService.revokePat,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", "pats"] }),
    onError,
  });

  const mcpUrl = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/mcp`;
  const command = `claude mcp add --transport http husrevity ${mcpUrl} --header "Authorization: Bearer ${issued ?? "<TOKEN>"}"`;
  const toggle = (s: PatScope) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">{t("integrations.mcp.title")}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("integrations.mcp.desc")}</p>

      <div className="mt-4 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-label={t("integrations.mcp.name")}
          className="w-full rounded-xl bg-transparent px-3 py-2 text-sm ring-1 ring-husrev-sand dark:ring-white/10"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {PAT_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
              {s}
            </label>
          ))}
        </div>
        <button
          className={BTN}
          disabled={issue.isPending || !name.trim() || scopes.length === 0}
          onClick={() => issue.mutate()}
        >
          {t("integrations.mcp.create")}
        </button>
      </div>

      {issued && (
        <div className="mt-4 rounded-2xl bg-husrev-sand/40 p-4 dark:bg-white/[0.04]">
          <p className="text-sm font-medium">{t("integrations.mcp.shownOnce")}</p>
          <code className="mt-2 block break-all select-all font-mono text-xs">{issued}</code>
          <p className="mt-3 text-sm">{t("integrations.mcp.command")}</p>
          <code className="mt-1 block break-all select-all font-mono text-xs">{command}</code>
        </div>
      )}

      {pats && pats.length > 0 && (
        <ul className="mt-4 divide-y divide-husrev-sand/70 dark:divide-white/5">
          {pats.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-gray-500">
                  {p.scopes.join(", ")} ·{" "}
                  {p.lastUsedAt
                    ? t("integrations.mcp.lastUsed", {
                        date: new Date(p.lastUsedAt).toLocaleDateString(),
                      })
                    : t("integrations.mcp.neverUsed")}
                </div>
              </div>
              <button
                className={BTN_GHOST}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(p.id)}
              >
                {t("integrations.mcp.revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function IntegrationsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("integrations.title")}
        kicker={t("integrations.kicker")}
        flourish={t("integrations.flourish")}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ChatLinkCard provider="telegram" />
        <ChatLinkCard provider="slack" />
        <GoogleCard />
        <McpCard />
      </div>
    </div>
  );
}
