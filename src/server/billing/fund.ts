import { Types } from "mongoose";
import { communitiesBilled, type CommunityFund, type FundHistoryEntry } from "@shared/billing";
import { GemTransaction } from "../models/gemTransaction";
import type { CommunityDocument } from "../models/community";
import { loadPeople } from "../chat/service";
import { communityMemberIds } from "../communities/service";
import { realtime } from "../realtime";
import { balanceOf, communityAccount, transfer, userAccount } from "./ledger";

// A community's fund: gems its members donate to pay its bills (docs/billing.md). Any member may donate, including ahead
// of time; the fund carries over month to month. Every movement is a ledger transfer.

const HISTORY_LIMIT = 50;

/** Donate gems from a member to the community's fund, once per request id. Returns the new fund and donor balance. */
export async function donate(
  community: CommunityDocument,
  donorId: string,
  gems: number,
  requestId: string,
): Promise<{ fund: number; balance: number }> {
  const fundAccount = communityAccount(community._id);
  await transfer({
    from: userAccount(donorId),
    to: fundAccount,
    amount: gems,
    kind: "donation",
    idempotencyKey: `donation:${community._id}:${donorId}:${requestId}`,
  });
  const [fund, balance] = await Promise.all([balanceOf(fundAccount), balanceOf(userAccount(donorId))]);
  announceFund(community, fund);
  return { fund, balance };
}

/** Tell the community's members its fund changed. */
export function announceFund(community: CommunityDocument, fund: number) {
  realtime.toUsers(communityMemberIds(community), "community:fund", { communityId: String(community._id), fund });
}

/** The fund's balance and its latest movements (donations and bill payments). For members only. */
export async function fundOf(community: CommunityDocument): Promise<CommunityFund> {
  const id = new Types.ObjectId(String(community._id));
  const rows = await GemTransaction.find({
    status: "applied",
    $or: [
      { "to.type": "community", "to.id": id },
      { "from.type": "community", "from.id": id },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .lean()
    .exec();

  const donors = rows.filter((r) => r.kind === "donation" && r.from?.type === "user").map((r) => String(r.from.id));
  const people = await loadPeople(donors);

  const history: FundHistoryEntry[] = rows.map((r) => {
    const incoming = r.to?.type === "community" && String(r.to.id) === String(id);
    const kind = r.kind === "donation" ? "donation" : r.kind === "bill" ? "bill" : "other";
    const donor = kind === "donation" ? people.get(String(r.from?.id)) : undefined;
    const month = (r.meta as { month?: string } | undefined)?.month;
    return {
      _id: String(r._id),
      kind,
      amount: incoming ? r.amount : -r.amount,
      at: (r.createdAt ?? new Date()).toISOString(),
      ...(kind === "donation"
        ? { by: donor ? { _id: donor._id, username: donor.username, avatar: donor.avatar } : null }
        : {}),
      ...(month ? { month } : {}),
    };
  });

  return {
    communityId: String(community._id),
    fund: await balanceOf(communityAccount(community._id)),
    history,
    donationsOpen: communitiesBilled(),
  };
}
