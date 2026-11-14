// Gem billing (docs/billing.md): every cost center, what it costs, and how a month's usage becomes a bill.
//
// Every center starts free (rate 0). Each one gets its rules and rate in its own discussion (#370 XenDrive, #371 Calls,
// #372 Recipe scanning, #373 House costs) and is then switched on here. Usage is stored as whole units (bytes,
// byte-days, scans); gems are worked out from them, so nothing drifts from adding up tiny fractions.
//
// Not cost centers, ever: text chat, the database and server CPU. The hub is self-hosted, so they cost nothing per user.

/** Who pays for a cost center: the account that used it (a person or a community), or the house (nobody is billed). */
export type CostCenterPayer = "account" | "house";

export interface CostCenter {
  id: string;
  /** Shown on the bill. */
  label: string;
  /** What it is, in a sentence a person understands. */
  description: string;
  /** The unit usage is stored in (always a whole number). */
  unit: "byte" | "byte_day" | "scan" | "email";
  /** The unit rates are given in and the bill shows, e.g. "GB", "GB-month". */
  displayUnit: string;
  /** How many stored units make one display unit. */
  unitsPerDisplayUnit: number;
  /** What one display unit costs us, in gems (before the margin). 0 while the center is free. */
  costRate: number;
  payer: CostCenterPayer;
  /** "free" until its discussion is done and it is switched on. */
  status: "free" | "metered";
  /** The provider whose bill this center covers, for the admin report. */
  provider: "cloud_storage" | "cloudflare_realtime" | "cloudflare_ai" | "resend";
}

const GB = 1_000_000_000;
const DAYS_PER_MONTH = 30;

export const COST_CENTERS = [
  {
    id: "storage",
    label: "Storage",
    description: "Files you keep: XenDrive, photos in other apps, and chat attachments.",
    unit: "byte_day",
    displayUnit: "GB-month",
    unitsPerDisplayUnit: GB * DAYS_PER_MONTH,
    costRate: 0,
    payer: "account",
    status: "free",
    provider: "cloud_storage",
  },
  {
    id: "downloads",
    label: "Downloads",
    description: "Files downloaded or opened, including through your share links.",
    unit: "byte",
    displayUnit: "GB",
    unitsPerDisplayUnit: GB,
    costRate: 0,
    payer: "account",
    status: "free",
    provider: "cloud_storage",
  },
  {
    id: "calls",
    label: "Voice and video",
    description: "Audio, video and screen shares delivered to you in calls.",
    unit: "byte",
    displayUnit: "GB",
    unitsPerDisplayUnit: GB,
    costRate: 0,
    payer: "account",
    status: "free",
    provider: "cloudflare_realtime",
  },
  {
    id: "recipe_scans",
    label: "Recipe scans",
    description: "Recipes read from a photo in XenKitchen.",
    unit: "scan",
    displayUnit: "scan",
    unitsPerDisplayUnit: 1,
    costRate: 0,
    payer: "account",
    status: "free",
    provider: "cloudflare_ai",
  },
  {
    id: "public_assets",
    label: "Pictures and emoji",
    description: "Profile pictures, group pictures, custom emoji and other public images.",
    unit: "byte_day",
    displayUnit: "GB-month",
    unitsPerDisplayUnit: GB * DAYS_PER_MONTH,
    costRate: 0,
    payer: "house",
    status: "free",
    provider: "cloud_storage",
  },
  {
    id: "backups",
    label: "Backups",
    description: "Database backups.",
    unit: "byte_day",
    displayUnit: "GB-month",
    unitsPerDisplayUnit: GB * DAYS_PER_MONTH,
    costRate: 0,
    payer: "house",
    status: "free",
    provider: "cloud_storage",
  },
  {
    id: "email",
    label: "Email",
    description: "Password resets and notification emails.",
    unit: "email",
    displayUnit: "email",
    unitsPerDisplayUnit: 1,
    costRate: 0,
    payer: "house",
    status: "free",
    provider: "resend",
  },
] as const satisfies readonly CostCenter[];

export type CostCenterId = (typeof COST_CENTERS)[number]["id"];

export const COST_CENTER_IDS = COST_CENTERS.map((c) => c.id) as CostCenterId[];

/** What we charge on top of the cost rate, so the hub covers its costs. */
export const BILLING_MARGIN = 1.25;

/** Gems a person can use each month without paying. Taken off the whole bill; it doesn't roll over. */
export const PERSON_FREE_TIER_GEMS = 300;
/** Gems a community can use each month without paying. */
export const COMMUNITY_FREE_TIER_GEMS = 300;

/** Share of the free tier at which the account is warned. */
export const FREE_TIER_WARNING_SHARE = 0.8;

export function costCenter(id: string): CostCenter | undefined {
  return (COST_CENTERS as readonly CostCenter[]).find((c) => c.id === id);
}

export const isCostCenterId = (id: string): id is CostCenterId => costCenter(id) !== undefined;

/** True while nothing is charged anywhere: every center is free or has no rate. */
export function everythingFree(centers: readonly CostCenter[] = COST_CENTERS): boolean {
  return centers.every((c) => c.status === "free" || c.costRate === 0);
}

/** True once some center billed to communities is switched on (until then the Donate button is hidden). */
export function communitiesBilled(centers: readonly CostCenter[] = COST_CENTERS): boolean {
  return centers.some((c) => c.payer === "account" && c.status === "metered" && c.costRate > 0);
}

/** What one display unit of a center is billed at, in gems: the cost rate times the margin. Free centers bill 0. */
export function billedRate(center: CostCenter, margin = BILLING_MARGIN): number {
  if (center.status === "free" || center.payer === "house") return 0;
  return center.costRate * margin;
}

/** Gems (a fraction) for some stored units of a center. */
export function costOf(center: CostCenter, units: number, margin = BILLING_MARGIN): number {
  return (units / center.unitsPerDisplayUnit) * billedRate(center, margin);
}

/** What a center actually cost us for some units, in gems, before the margin (for the admin report). */
export function providerCostOf(center: CostCenter, units: number): number {
  return (units / center.unitsPerDisplayUnit) * center.costRate;
}

export interface UsageLine {
  center: string;
  units: number;
}

export interface StatementLine {
  center: CostCenterId;
  label: string;
  units: number;
  /** Usage in the display unit (e.g. 1.25 GB). */
  quantity: number;
  displayUnit: string;
  /** Gems per display unit, margin included. */
  rate: number;
  /** Exact gems for this line (a fraction). */
  gems: number;
}

export interface Statement {
  lines: StatementLine[];
  /** Exact gems used across every line. */
  usageGems: number;
  freeTierGems: number;
  /** How much of the free tier this usage took. */
  freeTierUsed: number;
  freeTierLeft: number;
  /** What is owed: usage beyond the free tier, rounded up to a whole gem once for the whole bill. */
  amountDue: number;
}

/** Turn a month's usage into a bill. Only the account's own centers appear (house centers are never billed). */
export function statementOf(usage: readonly UsageLine[], freeTierGems: number, margin = BILLING_MARGIN): Statement {
  const units = new Map<CostCenterId, number>();
  for (const u of usage) {
    const center = costCenter(u.center);
    if (!center || center.payer === "house") continue;
    units.set(center.id as CostCenterId, (units.get(center.id as CostCenterId) ?? 0) + u.units);
  }
  const lines: StatementLine[] = [];
  for (const center of COST_CENTERS as readonly CostCenter[]) {
    const n = units.get(center.id as CostCenterId);
    if (n === undefined) continue;
    lines.push({
      center: center.id as CostCenterId,
      label: center.label,
      units: n,
      quantity: n / center.unitsPerDisplayUnit,
      displayUnit: center.displayUnit,
      rate: billedRate(center, margin),
      gems: costOf(center, n, margin),
    });
  }
  const usageGems = lines.reduce((sum, l) => sum + l.gems, 0);
  const freeTierUsed = Math.min(usageGems, freeTierGems);
  return {
    lines,
    usageGems,
    freeTierGems,
    freeTierUsed,
    freeTierLeft: Math.max(0, freeTierGems - usageGems),
    amountDue: ceilGems(Math.max(0, usageGems - freeTierGems)),
  };
}

// Float noise (0.1 + 0.2 = 0.30000000000000004) must not round a whole number up to the next one.
const EPSILON = 1e-9;

/** Round gems up to a whole number, for what is actually paid. */
export function ceilGems(gems: number): number {
  return gems <= EPSILON ? 0 : Math.ceil(gems - EPSILON);
}

/** Round gems up to one decimal, for a line on the bill. */
export function ceilGemsTenth(gems: number): number {
  return gems <= EPSILON ? 0 : Math.ceil(gems * 10 - EPSILON) / 10;
}

/**
 * Gems for people to read: one decimal, rounded up ("0.4 gems"), "less than 0.1 gems" for a sliver, whole numbers
 * without a decimal ("3 gems").
 */
export function formatGems(gems: number): string {
  if (gems <= EPSILON) return "0 gems";
  if (gems < 0.1) return "less than 0.1 gems";
  const rounded = ceilGemsTenth(gems);
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text} ${rounded === 1 ? "gem" : "gems"}`;
}

/** Whole gems for people to read ("1 gem", "1,200 gems"). */
export function formatWholeGems(gems: number): string {
  return `${gems.toLocaleString("en-US")} ${gems === 1 ? "gem" : "gems"}`;
}

/** The billing month a date falls in, in UTC ("2026-11"). */
export function billingMonth(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before ("2026-11" -> "2026-10"). */
export function previousBillingMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return billingMonth(new Date(Date.UTC(y, m - 2, 1)));
}

/** How far through a billing month a moment is, from 0 to 1 (for projecting the month). */
export function monthProgress(month: string, now: Date = new Date()): number {
  const [y, m] = month.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

/** One movement on a community fund's history, newest first. */
export interface FundHistoryEntry {
  _id: string;
  kind: "donation" | "bill" | "other";
  /** Positive when gems came in, negative when they went out. */
  amount: number;
  at: string;
  /** Who donated (for a donation). */
  by?: { _id: string; username: string; avatar: string } | null;
  /** The month a bill paid for ("2026-11"). */
  month?: string;
}

export interface CommunityFund {
  communityId: string;
  fund: number;
  history: FundHistoryEntry[];
  /** Whether donating is offered yet: only once something is billed to communities. */
  donationsOpen: boolean;
}

/** A cost center as the Billing view lists it, even before it has any usage. */
export interface BillingCenterInfo {
  id: CostCenterId;
  label: string;
  description: string;
  displayUnit: string;
  /** Gems per display unit, margin included (0 while free). */
  rate: number;
  free: boolean;
}

/** A closed month on the Billing view. */
export interface PastStatement {
  month: string;
  lines: StatementLine[];
  usageGems: number;
  freeTierUsed: number;
  amountDue: number;
  paid: number;
  unpaid: number;
  status: "pending" | "free" | "paid" | "unpaid" | "shadow";
}

/** Everything the Billing view shows for one account: a person's own bill, or a community's. */
export interface BillingOverview {
  account: { type: "user" | "community"; id: string };
  month: string;
  /** False in shadow mode: bills are shown but nothing is charged. */
  enforced: boolean;
  /** True while every center is free. */
  everythingFree: boolean;
  centers: BillingCenterInfo[];
  /** This month so far. */
  current: Statement;
  /** This month's usage if it carries on at the same pace (exact gems). */
  projectedGems: number;
  /** What the projection would owe beyond the free tier (whole gems). */
  projectedDue: number;
  /** The person's gems, or the community's fund. */
  balance: number;
  /** Owed from earlier months. */
  unpaid: number;
  /** Months the balance covers at the projected rate; null when nothing is due (it covers any number). */
  monthsCovered: number | null;
  statements: PastStatement[];
  /** Communities only: whether the Donate button is offered yet. */
  donationsOpen?: boolean;
}
