import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ChatMessage, ChatPerson } from "@shared/chat";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { patchThread, removeLocalReply, upsertReply, type LocalMessage, type ThreadData } from "../../utils/chatCache";
import { chatKeys } from "./keys";
import type { SendInput } from "./useChat";

const base = (conversationId: string) => `/api/chat/conversations/${conversationId}`;

/** One thread: the message it hangs off and the latest replies. Loaded when it is open. */
export function useThread(conversationId: string, rootSeq: number | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chatKeys.thread(conversationId, rootSeq ?? 0),
    queryFn: () => api.get<ThreadData>(`${base(conversationId)}/messages/${rootSeq}/thread`),
    enabled: isAuthenticated && rootSeq !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** A chat's threads, most recently active first (loaded when the list is open). */
export function useThreads(conversationId: string, enabled: boolean) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chatKeys.threads(conversationId),
    queryFn: () => api.get<{ threads: ChatMessage[]; people: ChatPerson[] }>(`${base(conversationId)}/threads`),
    enabled: isAuthenticated && enabled,
    retry: false,
  });
}

/** Put an updated message (an edit, a delete, a reaction, a new reply count) into every open thread it appears in. */
export function patchThreads(queryClient: QueryClient, message: ChatMessage) {
  queryClient.setQueriesData<ThreadData>({ queryKey: chatKeys.thread(message.conversationId) }, (data) =>
    patchThread(data, message),
  );
}

/** A reply arrived (or was sent): into its thread if that is open, and the chat's thread list is stale. */
export function receiveReply(queryClient: QueryClient, reply: LocalMessage) {
  if (typeof reply.threadRoot !== "number") return;
  queryClient.setQueryData<ThreadData>(chatKeys.thread(reply.conversationId, reply.threadRoot), (data) =>
    upsertReply(data, reply),
  );
  void queryClient.invalidateQueries({ queryKey: chatKeys.threads(reply.conversationId) });
}

/** Reply in a thread. It shows at once, then turns into the stored one (or a failed one to retry). */
export function useSendThreadReply(conversationId: string, rootSeq: number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = chatKeys.thread(conversationId, rootSeq);

  return useMutation({
    mutationFn: async (input: SendInput) =>
      (
        await api.post<{ message: ChatMessage }>(`${base(conversationId)}/messages`, {
          clientId: input.clientId,
          body: input.body,
          replyTo: input.replyTo,
          threadRoot: rootSeq,
          attachmentIds: input.attachmentIds,
          gif: input.gif,
        })
      ).message,
    onMutate: (input) => {
      const local: LocalMessage = {
        _id: `local-${input.clientId}`,
        conversationId,
        seq: Number.MAX_SAFE_INTEGER,
        from: user.id,
        kind: "text",
        body: input.body,
        attachments: input.attachments ?? [],
        gif: input.gif ?? null,
        replyTo: input.replyTo ?? null,
        threadRoot: rootSeq,
        reactions: [],
        createdAt: new Date().toISOString(),
        clientId: input.clientId,
        status: "sending",
      };
      queryClient.setQueryData<ThreadData>(key, (data) => upsertReply(data, local));
    },
    onSuccess: (message) => queryClient.setQueryData<ThreadData>(key, (data) => upsertReply(data, message)),
    onError: (_error, input) =>
      queryClient.setQueryData<ThreadData>(key, (data) =>
        data
          ? {
              ...data,
              replies: data.replies.map((m) =>
                m.clientId === input.clientId ? { ...m, status: "failed" as const } : m,
              ),
            }
          : data,
      ),
  });
}

export function useDiscardLocalReply(conversationId: string, rootSeq: number) {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.setQueryData<ThreadData>(chatKeys.thread(conversationId, rootSeq), (data) =>
      removeLocalReply(data, id),
    );
}

/** Follow a thread (you are told of its replies) or stop. */
export function useFollowThread(conversationId: string, rootSeq: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (follow: boolean) => {
      const url = `${base(conversationId)}/messages/${rootSeq}/thread/follow`;
      await (follow ? api.put<{ following: boolean }>(url) : api.delete<{ following: boolean }>(url));
      return follow;
    },
    onSuccess: (following) =>
      queryClient.setQueryData<ThreadData>(chatKeys.thread(conversationId, rootSeq), (data) =>
        data ? { ...data, following } : data,
      ),
  });
}
