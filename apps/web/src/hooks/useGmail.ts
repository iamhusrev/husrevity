import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gmailService } from "@/services/gmail-service";
import { GmailSendRequest } from "@/types/gmail/gmail";

const GMAIL_KEYS = {
  accounts: ["gmail-accounts"] as const,
  messages: (accountId: number) => ["gmail-messages", accountId] as const,
  message: (accountId: number, mid: string) => ["gmail-message", accountId, mid] as const,
};

export function useGmailAccounts() {
  return useQuery({
    queryKey: GMAIL_KEYS.accounts,
    queryFn: () => gmailService.listAccounts(),
    select: (d) => d.data,
  });
}

export function useRemoveGmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => gmailService.removeAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: GMAIL_KEYS.accounts }),
  });
}

export function useGmailMessages(accountId: number, size = 30) {
  return useInfiniteQuery({
    queryKey: GMAIL_KEYS.messages(accountId),
    queryFn: ({ pageParam }) =>
      gmailService.listMessages(accountId, { page: pageParam as number, size }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const d = last.data;
      return d.page + 1 < d.totalPages ? d.page + 1 : undefined;
    },
    enabled: Number.isFinite(accountId) && accountId > 0,
  });
}

export function useGmailMessage(accountId: number, mid: string | null) {
  return useQuery({
    queryKey: GMAIL_KEYS.message(accountId, mid ?? ""),
    queryFn: () => gmailService.getMessage(accountId, mid as string),
    select: (d) => d.data,
    enabled: !!mid && Number.isFinite(accountId) && accountId > 0,
  });
}

export function useSendGmailMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: number; body: GmailSendRequest }) =>
      gmailService.sendMessage(accountId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.messages(vars.accountId) });
    },
  });
}

export function useSyncGmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: number) => gmailService.syncAccount(accountId),
    onSuccess: (_, accountId) => {
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.messages(accountId) });
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.accounts });
    },
  });
}

type MsgVars = { accountId: number; mid: string };

function useMessageMutation(fn: (accountId: number, mid: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, mid }: MsgVars) => fn(accountId, mid),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.messages(vars.accountId) });
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.message(vars.accountId, vars.mid) });
      qc.invalidateQueries({ queryKey: GMAIL_KEYS.accounts });
    },
  });
}

export function useMarkGmailRead() {
  return useMessageMutation((a, m) => gmailService.markRead(a, m));
}

export function useMarkGmailUnread() {
  return useMessageMutation((a, m) => gmailService.markUnread(a, m));
}

export function useStarGmailMessage() {
  return useMessageMutation((a, m) => gmailService.star(a, m));
}

export function useUnstarGmailMessage() {
  return useMessageMutation((a, m) => gmailService.unstar(a, m));
}

export function useGmailCalendar(
  accountId: number,
  range: { from?: string; to?: string },
) {
  return useQuery({
    queryKey: ["gmail-calendar", accountId, range.from, range.to],
    queryFn: () => gmailService.listCalendar(accountId, range),
    select: (d) => d.data,
    enabled: Number.isFinite(accountId) && accountId > 0 && !!range.from && !!range.to,
  });
}

export function useGmailContacts(accountId: number) {
  return useQuery({
    queryKey: ["gmail-contacts", accountId],
    queryFn: () => gmailService.listContacts(accountId),
    select: (d) => d.data,
    enabled: Number.isFinite(accountId) && accountId > 0,
  });
}

export function useGmailDrive(accountId: number) {
  return useQuery({
    queryKey: ["gmail-drive", accountId],
    queryFn: () => gmailService.listDrive(accountId),
    select: (d) => d.data,
    enabled: Number.isFinite(accountId) && accountId > 0,
  });
}

export function useGmailAuthorizeUrl() {
  return useMutation({
    mutationFn: (provider: "google" | "microsoft" = "google") =>
      gmailService.getAuthorizeUrl(provider),
  });
}
