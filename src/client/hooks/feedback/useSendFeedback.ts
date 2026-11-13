import { useMutation } from "@tanstack/react-query";
import { api } from "../../config/api";

export const useSendFeedback = () =>
  useMutation({ mutationFn: (input: { message: string }) => api.post("/api/feedback", input) });
