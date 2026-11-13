import { useMutation } from "@tanstack/react-query";
import type { FeedbackKind } from "@shared/feedback";
import { api } from "../../config/api";

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** The in-app page they came from. */
  page?: string;
}

export const useSendFeedback = () =>
  useMutation({ mutationFn: (input: FeedbackInput) => api.post("/api/feedback", input) });
