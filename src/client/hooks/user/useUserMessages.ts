import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { get, post, put, del } from "../../utils/apiClient";

export interface Message {
  _id: string;
  from: string;
  message: string;
  time: string;
  parentMessageId?: string;
  senderUsername?: string;
  isSystemMessage?: boolean;
}

export interface ParticipantInfo {
  _id: string;
  username: string;
}

export interface Conversation {
  _id: string;
  participants: string[];
  participantInfo?: ParticipantInfo[];
  name?: string;
  canReply?: boolean;
  createdBy?: string; // user ID of the conversation creator
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  updatedAt: string;
  messageCount?: number;
  messages?: Message[];
}

interface UseUserMessagesReturn {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  fetchConversation: (conversationId: string) => Promise<Conversation | undefined>;
  markConversationAsRead: (conversationId: string) => void;
  isMarkingAsRead: boolean;
  sendMessage: (conversationId: string, message: string, parentMessageId?: string) => void;
  isSendingMessage: boolean;
  replyToMessage: (conversationId: string, messageId: string, message: string) => void;
  isReplying: boolean;
  deleteMessage: (conversationId: string, messageId: string) => void;
  isDeletingMessage: boolean;
  createConversation: (participants: string[], message?: string) => void;
  isCreatingConversation: boolean;
  addParticipants: (conversationId: string, participantIds: string[]) => void;
  isAddingParticipants: boolean;
  removeParticipant: (conversationId: string, participantId: string) => void;
  isRemovingParticipant: boolean;
  updateConversationName: (conversationId: string, name: string) => Promise<boolean>;
  isUpdatingName: boolean;
  leaveConversation: (conversationId: string) => Promise<boolean>;
  isLeaving: boolean;
}

const fetchUserConversations = async (): Promise<Conversation[]> => {
  const data = await get<{ conversations: Conversation[] }>("/api/user/messages");
  return data.conversations;
};

const fetchConversationById = async (conversationId: string): Promise<Conversation> => {
  const data = await get<{ conversation: Conversation }>(`/api/user/messages/${conversationId}`);
  return data.conversation;
};

const markConversationAsRead = async (conversationId: string): Promise<void> => {
  await put(`/api/user/messages/${conversationId}/mark-read`);
};

const sendMessageToConversation = async (conversationId: string, message: string, parentMessageId?: string): Promise<Message> => {
  const data = await post<{ message: Message }>(`/api/user/messages/${conversationId}`, { message, parentMessageId });
  return data.message;
};

const replyToMessage = async (conversationId: string, messageId: string, message: string): Promise<Message> => {
  const data = await post<{ message: Message }>(`/api/user/messages/${conversationId}/reply/${messageId}`, { message });
  return data.message;
};

const deleteMessageFromConversation = async (conversationId: string, messageId: string): Promise<void> => {
  await del(`/api/user/messages/${conversationId}/messages/${messageId}`);
};

const createNewConversation = async (participants: string[], message?: string): Promise<Conversation> => {
  const data = await post<{ conversation: Conversation }>("/api/user/messages", { participants, message });
  return data.conversation;
};

const addParticipantsToConversation = async (conversationId: string, participantIds: string[]): Promise<Conversation> => {
  const data = await post<{ conversation: Conversation }>(`/api/user/messages/${conversationId}/participants`, { participantIds });
  return data.conversation;
};

const removeParticipantFromConversation = async (conversationId: string, participantId: string): Promise<Conversation> => {
  const data = await del<{ conversation: Conversation }>(`/api/user/messages/${conversationId}/participants/${participantId}`);
  return data.conversation;
};

export const useUserMessages = (): UseUserMessagesReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Query for fetching user conversations
  const {
    data: conversations,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["userConversations"],
    queryFn: fetchUserConversations,
    enabled: isAuthenticated,
    staleTime: 0, // Always consider data stale to allow refetching
    cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Function to fetch a single conversation
  const fetchConversation = async (conversationId: string): Promise<Conversation | undefined> => {
    if (!isAuthenticated) return undefined;
    
    const cached = queryClient.getQueryData<Conversation[]>(["userConversations"]);
    const cachedConv = cached?.find(c => c._id === conversationId);
    if (cachedConv && cachedConv.messages) {
      return cachedConv;
    }

    const conversation = await fetchConversationById(conversationId);
    queryClient.setQueryData(["userConversations"], (oldData: Conversation[] | undefined) => {
      if (!oldData) return oldData;
      return oldData.map(conv => 
        conv._id === conversationId ? conversation : conv
      );
    });
    return conversation;
  };

  // Mutation for marking conversation as read
  const { mutate: markConversationAsReadMutation, isPending: isMarkingAsRead } = useMutation({
    mutationFn: markConversationAsRead,
    onSuccess: (_, conversationId) => {
      queryClient.setQueryData(["userConversations"], (oldData: Conversation[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(conv => 
          conv._id === conversationId ? { ...conv, unread: false } : conv
        );
      });
      // Also invalidate user profile to update unread_messages
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
    onError: (error) => {
      console.error("Failed to mark conversation as read:", error);
    },
  });

  // Mutation for sending a message
  const { mutate: sendMessageMutation, isPending: isSendingMessage } = useMutation({
    mutationFn: ({ conversationId, message, parentMessageId }: { conversationId: string; message: string; parentMessageId?: string }) =>
      sendMessageToConversation(conversationId, message, parentMessageId),
    onMutate: async ({ conversationId, message, parentMessageId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["userConversations"] });

      // Snapshot the previous value
      const previousConversations = queryClient.getQueryData<Conversation[]>(["userConversations"]);
      const userProfile = queryClient.getQueryData<any>(["userProfile"]);

      // Optimistically update the conversation
      if (previousConversations && userProfile?._id) {
        const optimisticMessage: Message = {
          _id: `temp-${Date.now()}`,
          from: userProfile._id,
          message: message,
          time: new Date().toISOString(),
          unread: false,
          parentMessageId: parentMessageId,
          senderUsername: userProfile.username,
        };

        const updatedConversations = previousConversations.map((conv) => {
          if (conv._id === conversationId) {
            return {
              ...conv,
              messages: [...(conv.messages || []), optimisticMessage],
              lastMessage: message,
              lastMessageTime: optimisticMessage.time,
            };
          }
          return conv;
        });

        queryClient.setQueryData(["userConversations"], updatedConversations);
      }

      return { previousConversations };
    },
    onSuccess: (newMessage, { conversationId }) => {
      // Update with real message from server
      queryClient.setQueryData<Conversation[]>(["userConversations"], (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((conv) => {
          if (conv._id === conversationId) {
            // Remove temporary message and add real one
            const messagesWithoutTemp = (conv.messages || []).filter(
              (msg) => !msg._id.startsWith("temp-")
            );
            return {
              ...conv,
              messages: [...messagesWithoutTemp, newMessage],
              lastMessage: newMessage.message,
              lastMessageTime: newMessage.time,
            };
          }
          return conv;
        });
      });
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        queryClient.setQueryData(["userConversations"], context.previousConversations);
      }
      console.error("Failed to send message:", error);
    },
  });

  // Mutation for replying to a message
  const { mutate: replyToMessageMutation, isPending: isReplying } = useMutation({
    mutationFn: ({ conversationId, messageId, message }: { conversationId: string; messageId: string; message: string }) =>
      replyToMessage(conversationId, messageId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
    onError: (error) => {
      console.error("Failed to reply to message:", error);
    },
  });

  // Mutation for deleting a message
  const { mutate: deleteMessageMutation, isPending: isDeletingMessage } = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      deleteMessageFromConversation(conversationId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
    },
    onError: (error) => {
      console.error("Failed to delete message:", error);
    },
  });

  // Mutation for creating a new conversation
  const { mutate: createConversationMutation, isPending: isCreatingConversation } = useMutation({
    mutationFn: ({ participants, message }: { participants: string[]; message?: string }) =>
      createNewConversation(participants, message),
    onSuccess: (newConversation) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      // Store the new conversation ID for navigation
      queryClient.setQueryData(["newConversationId"], newConversation._id);
    },
    onError: (error) => {
      console.error("Failed to create conversation:", error);
    },
  });

  // Mutation for adding participants
  const { mutate: addParticipantsMutation, isPending: isAddingParticipants } = useMutation({
    mutationFn: ({ conversationId, participantIds }: { conversationId: string; participantIds: string[] }) =>
      addParticipantsToConversation(conversationId, participantIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
    },
    onError: (error) => {
      console.error("Failed to add participants:", error);
    },
  });

  // Mutation for removing a participant
  const { mutate: removeParticipantMutation, isPending: isRemovingParticipant } = useMutation({
    mutationFn: ({ conversationId, participantId }: { conversationId: string; participantId: string }) =>
      removeParticipantFromConversation(conversationId, participantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
    },
    onError: (error) => {
      console.error("Failed to remove participant:", error);
    },
  });

  // Function to update conversation name
  const updateConversationNameFn = async (conversationId: string, name: string): Promise<boolean> => {
    const data = await put<{ status: boolean }>(`/api/user/messages/${conversationId}/name`, { name });
    return data.status;
  };

  // Mutation for updating conversation name
  const { mutateAsync: updateNameMutation, isPending: isUpdatingName } = useMutation({
    mutationFn: ({ conversationId, name }: { conversationId: string; name: string }) =>
      updateConversationNameFn(conversationId, name),
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
    onError: (error) => {
      console.error("Failed to update conversation name:", error);
    },
  });

  // Function to leave conversation
  const leaveConversationFn = async (conversationId: string): Promise<boolean> => {
    const data = await post<{ status: boolean }>(`/api/user/messages/${conversationId}/leave`);
    return data.status;
  };

  // Mutation for leaving conversation
  const { mutateAsync: leaveConversationMutation, isPending: isLeaving } = useMutation({
    mutationFn: leaveConversationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"] });
    },
    onError: (error) => {
      console.error("Failed to leave conversation:", error);
    },
  });

  return {
    conversations,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    fetchConversation,
    markConversationAsRead: markConversationAsReadMutation,
    isMarkingAsRead,
    sendMessage: (conversationId: string, message: string, parentMessageId?: string) =>
      sendMessageMutation({ conversationId, message, parentMessageId }),
    isSendingMessage,
    replyToMessage: (conversationId: string, messageId: string, message: string) =>
      replyToMessageMutation({ conversationId, messageId, message }),
    isReplying,
    deleteMessage: (conversationId: string, messageId: string) =>
      deleteMessageMutation({ conversationId, messageId }),
    isDeletingMessage,
    createConversation: (participants: string[], message?: string) =>
      createConversationMutation({ participants, message }),
    isCreatingConversation,
    addParticipants: (conversationId: string, participantIds: string[]) =>
      addParticipantsMutation({ conversationId, participantIds }),
    isAddingParticipants,
    removeParticipant: (conversationId: string, participantId: string) =>
      removeParticipantMutation({ conversationId, participantId }),
    isRemovingParticipant,
    updateConversationName: async (conversationId: string, name: string) => {
      await updateNameMutation({ conversationId, name });
      return true;
    },
    isUpdatingName,
    leaveConversation: leaveConversationMutation,
    isLeaving,
  };
};

