import type { AttentionCard, AttentionResponse, AttentionSeverity } from "@shared/feed";
import type { AttentionProvider } from "./providers/types";
import { routineProvider } from "./providers/xenroutine";
import { splitProvider } from "./providers/xensplit";
import { budgetProvider } from "./providers/xenbudget";
import { chatProvider } from "./providers/chat";
import { mentionsProvider } from "./providers/mentions";
import { driveProvider } from "./providers/xendrive";

// "Needs attention": every sub-app that has something waiting adds a provider to this list. They run side by side;
// one that is slow or fails is left out and the rest still answer.
export const PROVIDERS: AttentionProvider[] = [
  routineProvider,
  budgetProvider,
  splitProvider,
  chatProvider,
  mentionsProvider,
  driveProvider,
];

export const PROVIDER_TIMEOUT_MS = 4000;
const RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

function withTimeout<T>(work: Promise<T>, ms: number, key: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`attention provider ${key} timed out`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function readAttention(
  userId: string,
  providers: AttentionProvider[] = PROVIDERS,
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<AttentionResponse> {
  const settled = await Promise.allSettled(
    providers.map((p) =>
      withTimeout(
        Promise.resolve().then(() => p.fetch(userId)),
        timeoutMs,
        p.key,
      ),
    ),
  );
  const cards: AttentionCard[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") cards.push(...result.value);
    else console.error(`Attention provider ${providers[i].key} failed:`, result.reason);
  });
  // Worst first; the order inside a severity is the provider order above.
  cards.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const counts: Record<string, number> = {};
  for (const card of cards) counts[card.app] = (counts[card.app] ?? 0) + card.count;
  return { cards, counts };
}
