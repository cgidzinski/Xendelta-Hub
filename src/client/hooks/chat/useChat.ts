import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatGif } from "@shared/gif";
import type {
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatPerson,
  ChatVoice,
  ChatSearchHas,
  ChatSearchResult,
} from "@shared/chat";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { chatKeys } from "./keys";
import { patchThreads } from "./useThread";
import { communityKeys } from "../communities/keys";
import {
  patchMessage,
  removeLocalMessage,
  upsertMessage,
  type LocalMessage,
  type MessagesData,
  type MessagesPage,
} from "../../utils/chatCache";

// ---------- reading ----------

interface ConversationsPage {
  conversations: ChatConversation[];
  nextCursor: string | null;
}

/** The caller's conversations, newest activity first, loaded a page at a time. */
export function useConversations() {
  const { isAuthenticated } = useAuth();
  const query = useInfiniteQuery({
    queryKey: chatKeys.conversations(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<ConversationsPage>("/api/chat/conversations", { params: pageParam ? { cursor: pageParam } : undefined }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAuthenticated,
  });
  const conversations = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((p) => p.conversations)
      .filter((c) => !seen.has(c._id) && !!seen.add(c._id));
  }, [query.data]);
  return { ...query, conversations };
}

export function useConversation(conversationId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chatKeys.conversation(conversationId ?? ""),
    queryFn: async () =>
      (await api.get<{ conversation: ChatConversation }>(`/api/chat/conversations/${conversationId}`)).conversation,
    enabled: isAuthenticated && !!conversationId,
    retry: false,
  });
}

/** A chat's history, newest page first; `fetchNextPage` loads older messages. Live changes patch this cache. */
export function useMessages(conversationId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useInfiniteQuery<MessagesPage, Error, MessagesData, ReturnType<typeof chatKeys.messages>, number | undefined>({
    queryKey: chatKeys.messages(conversationId ?? ""),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      api.get<MessagesPage>(`/api/chat/conversations/${conversationId}/messages`, {
        params: pageParam ? { before: pageParam } : undefined,
      }),
    getNextPageParam: (last) => (last.hasMore ? Math.min(...last.messages.map((m) => m.seq)) : undefined),
    enabled: isAuthenticated && !!conversationId,
    // The cache is patched live; refetching every loaded page on focus would only repeat that.
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * A window of history around one message, for a jump to a link, a reply or the first unread. It is kept apart from the
 * live history so the live pages never have a hole in them. `hasNewer` says the window stops short of the present.
 */
export function useAroundMessages(conversationId: string | undefined, seq: number | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chatKeys.around(conversationId ?? "", seq ?? 0),
    queryFn: async () => {
      const page = await api.get<MessagesPage & { hasNewer?: boolean }>(
        `/api/chat/conversations/${conversationId}/messages`,
        { params: { around: seq } },
      );
      const data: MessagesData = { pages: [page], pageParams: [undefined] };
      return { data, hasNewer: !!page.hasNewer };
    },
    enabled: isAuthenticated && !!conversationId && seq !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** The messages pinned in a chat (loaded when the pins panel is open), newest pin first. */
export function usePins(conversationId: string | undefined, enabled: boolean) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chatKeys.pins(conversationId ?? ""),
    queryFn: () =>
      api.get<{ messages: ChatMessage[]; people: ChatPerson[] }>(`/api/chat/conversations/${conversationId}/pins`),
    enabled: isAuthenticated && !!conversationId && enabled,
    retry: false,
  });
}

export interface ChatSearchParams {
  q: string;
  conversationId?: string;
  communityId?: string;
  from?: string;
  has?: ChatSearchHas;
  after?: string;
  before?: string;
}

/** Message search, a page at a time (newest first). Runs only when there is something to look for. */
export function useChatSearch(params: ChatSearchParams, enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const hasQuery = params.q.trim().length > 0 || !!params.from || !!params.has;
  return useInfiniteQuery({
    queryKey: chatKeys.search({ ...params }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
      if (pageParam > 0) query.set("offset", String(pageParam));
      return api.get<{ results: ChatSearchResult[]; hasMore: boolean; people: ChatPerson[] }>(
        `/api/chat/search?${query.toString()}`,
      );
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, p) => n + p.results.length, 0) : undefined),
    enabled: isAuthenticated && enabled && hasQuery,
    retry: false,
  });
}

/** How many conversations have something unread. */
export function useChatUnread() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: chatKeys.unread(),
    queryFn: async () => (await api.get<{ count: number }>("/api/chat/unread")).count,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  return { count: query.data ?? 0, isLoading: query.isLoading };
}

// ---------- sending ----------

export interface SendInput {
  /** Chosen here, so a retry of the same send is stored once. */
  clientId: string;
  body: string;
  replyTo?: number;
  /** XenDrive file ids; `attachments` is what to draw while it sends. */
  attachmentIds?: string[];
  attachments?: ChatAttachment[];
  /** A GIF from the picker. */
  gif?: ChatGif;
  /** Marks the one attachment as a voice message. */
  voice?: ChatVoice;
}

export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Send into a chat. The message appears at once, and turns into the stored one (or a failed one to retry). */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = chatKeys.messages(conversationId);

  return useMutation({
    mutationFn: async (input: SendInput) =>
      (
        await api.post<{ message: ChatMessage }>(`/api/chat/conversations/${conversationId}/messages`, {
          clientId: input.clientId,
          body: input.body,
          replyTo: input.replyTo,
          attachmentIds: input.attachmentIds,
          gif: input.gif,
          voice: input.voice,
        })
      ).message,
    onMutate: (input) => {
      const local: LocalMessage = {
        _id: `local-${input.clientId}`,
        conversationId,
        // No real number yet: it sorts after everything stored.
        seq: Number.MAX_SAFE_INTEGER,
        from: user.id,
        kind: "text",
        body: input.body,
        attachments: input.attachments ?? [],
        gif: input.gif ?? null,
        voice: input.voice ?? null,
        replyTo: input.replyTo ?? null,
        reactions: [],
        createdAt: new Date().toISOString(),
        clientId: input.clientId,
        status: "sending",
      };
      queryClient.setQueryData<MessagesData>(key, (data) => upsertMessage(data, local));
    },
    onSuccess: (message) => {
      queryClient.setQueryData<MessagesData>(key, (data) => upsertMessage(data, message));
    },
    onError: (_error, input) => {
      queryClient.setQueryData<MessagesData>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) =>
                  m.clientId === input.clientId && m.status ? { ...m, status: "failed" as const } : m,
                ),
              })),
            }
          : data,
      );
    },
  });
}

/** Dismiss a message that failed to send. */
export function useDiscardLocalMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) => removeLocalMessage(data, id));
}

// ---------- everything else you can do ----------

/** The actions on chats and messages. Each updates the cache from the answer, so the screen changes at once. */
export function useChatActions() {
  const queryClient = useQueryClient();
  const base = (conversationId: string) => `/api/chat/conversations/${conversationId}`;

  const setConversation = (conversation: ChatConversation) => {
    queryClient.setQueryData(chatKeys.conversation(conversation._id), conversation);
    queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
  };
  const setMessage = (message: ChatMessage) => {
    queryClient.setQueryData<MessagesData>(chatKeys.messages(message.conversationId), (data) =>
      patchMessage(data, message),
    );
    patchThreads(queryClient, message);
  };

  const startChat = useMutation({
    mutationFn: (input: { userIds: string[]; name?: string }) =>
      api.post<{ conversation: ChatConversation; created: boolean }>("/api/chat/conversations", input),
    onSuccess: ({ conversation }) => setConversation(conversation),
  });

  const rename = useMutation({
    mutationFn: async (input: { conversationId: string; name: string }) =>
      (await api.patch<{ conversation: ChatConversation }>(base(input.conversationId), { name: input.name }))
        .conversation,
    onSuccess: setConversation,
  });

  const addMembers = useMutation({
    mutationFn: async (input: { conversationId: string; userIds: string[] }) =>
      (
        await api.post<{ conversation: ChatConversation }>(`${base(input.conversationId)}/members`, {
          userIds: input.userIds,
        })
      ).conversation,
    onSuccess: setConversation,
  });

  /** Remove someone, or leave (with your own id). */
  const removeMember = useMutation({
    mutationFn: (input: { conversationId: string; userId: string }) =>
      api.delete<{ left: boolean }>(`${base(input.conversationId)}/members/${input.userId}`),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(input.conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });

  const makeOwner = useMutation({
    mutationFn: async (input: { conversationId: string; userId: string }) =>
      (
        await api.patch<{ conversation: ChatConversation }>(`${base(input.conversationId)}/members/${input.userId}`, {
          role: "owner",
        })
      ).conversation,
    onSuccess: setConversation,
  });

  const setMine = useMutation({
    mutationFn: (input: { conversationId: string; muted?: boolean; hidden?: boolean }) =>
      api.patch<unknown>(`${base(input.conversationId)}/me`, { muted: input.muted, hidden: input.hidden }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(input.conversationId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    },
  });

  const markRead = useMutation({
    mutationFn: (input: { conversationId: string; seq: number }) =>
      api.post<{ lastReadSeq: number }>(`${base(input.conversationId)}/read`, { seq: input.seq }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      // A community channel keeps its read state with its channel list.
      queryClient.invalidateQueries({ queryKey: communityKeys.allChannels() });
      void input;
    },
  });

  const edit = useMutation({
    mutationFn: async (input: { conversationId: string; seq: number; body: string }) =>
      (
        await api.patch<{ message: ChatMessage }>(`${base(input.conversationId)}/messages/${input.seq}`, {
          body: input.body,
        })
      ).message,
    onSuccess: setMessage,
  });

  const remove = useMutation({
    mutationFn: async (input: { conversationId: string; seq: number }) =>
      (await api.delete<{ message: ChatMessage }>(`${base(input.conversationId)}/messages/${input.seq}`)).message,
    onSuccess: setMessage,
  });

  /** Pin a message, or take its pin off. */
  const pin = useMutation({
    mutationFn: async (input: { conversationId: string; seq: number; on: boolean }) => {
      const url = `${base(input.conversationId)}/messages/${input.seq}/pin`;
      return (await (input.on ? api.put<{ message: ChatMessage }>(url) : api.delete<{ message: ChatMessage }>(url)))
        .message;
    },
    onSuccess: (message) => {
      setMessage(message);
      queryClient.invalidateQueries({ queryKey: chatKeys.pins(message.conversationId) });
    },
  });

  /** Take the link previews off a message. */
  const removeEmbeds = useMutation({
    mutationFn: async (input: { conversationId: string; seq: number }) =>
      (await api.delete<{ message: ChatMessage }>(`${base(input.conversationId)}/messages/${input.seq}/embeds`))
        .message,
    onSuccess: setMessage,
  });

  const react = useMutation({
    mutationFn: async (input: { conversationId: string; seq: number; emoji: string; on: boolean }) => {
      const url = `${base(input.conversationId)}/messages/${input.seq}/reactions/${encodeURIComponent(input.emoji)}`;
      return (await (input.on ? api.put<{ message: ChatMessage }>(url) : api.delete<{ message: ChatMessage }>(url)))
        .message;
    },
    onSuccess: setMessage,
  });

  return {
    startChat,
    rename,
    addMembers,
    removeMember,
    makeOwner,
    setMine,
    markRead,
    edit,
    remove,
    react,
    removeEmbeds,
    pin,
  };
}
