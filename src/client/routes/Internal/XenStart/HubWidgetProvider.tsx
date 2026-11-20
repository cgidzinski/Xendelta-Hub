import { createContext, type ReactNode } from "react";
import { useAttention } from "../../../hooks/feed/useFeed";

export const AttentionContext = createContext<ReturnType<typeof useAttention> | null>(null);

export default function HubWidgetProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const attention = useAttention(enabled);
  return <AttentionContext.Provider value={attention}>{children}</AttentionContext.Provider>;
}
