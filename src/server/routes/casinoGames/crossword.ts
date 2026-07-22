/**
 * Crossword — a real intersecting crossword grid, procedurally generated fresh per play (a
 * 10x10 grid, 8 words placed via randomized greedy intersection search - not read off one
 * fixed template). Which words count as "found" is decided first via a `TIERS` table keyed by
 * word count, same "one weighted draw decides the whole outcome" shape as Kitty Scratch's
 * `prizeWeights.ts` (just returning a tier object instead of a bare value, since grid
 * generation needs the target *count*, not just its dollar amount) - "your letters" (the upper
 * circles) are built from the found words' letters plus random decoy filler purely for display,
 * never re-derived from or capable of changing which words are found or the payout, even if a
 * decoy happens to coincidentally spell out a word that wasn't drawn as found.
 *
 * Same debit-at-start pattern as every other game here: the whole outcome (grid, which words
 * are found, the letters shown, the total payout) is fully decided and persisted into a
 * XenCasinoRound *before* any money moves, so a periodic sweep can safely finish a round that
 * died mid-settlement without ever re-drawing it.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
const mongoose = require("mongoose");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { requireGameEnabled } from "../../utils/casinoStatus";
import { drawPrizeWeight, prizeRtp } from "./prizeWeights";
import { scheduleStaleRoundSweep } from "./staleRoundRecovery";

const SLUG = "crossword";
const PRICE = 20000;
// Padding target for "your letters" - typical found-counts (2-4 words) comfortably fit; the
// background art has 30 baked-in circle positions, so this leaves headroom. In the rare case
// a big found-count (7-8 words) needs more letters than this, the bag simply grows past it
// (still fully correct for payout purposes) - a very rare, purely cosmetic edge case.
const CIRCLE_COUNT = 24;

type Direction = "across" | "down";

const ROWS = 10;
const COLS = 10;
const TARGET_WORD_COUNT = 8;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 8;

// A broad bank across many lengths (no per-word prize - pure grid filler) gives the generator
// plenty of intersection options to reliably hit the target word count.
const WORD_BANK: Record<number, string[]> = {
    3: ["CAT", "DOG", "SUN", "WIN", "BIG", "RUN", "FUN", "BOX", "CUP", "TEA", "RED", "TOP", "OAK", "YAK", "SKY", "ICE", "JOY", "HAT", "BAT", "CAR", "BAR", "JAR", "EAR", "ARM", "LEG", "EYE", "LIP", "TOE", "KEY", "BEE", "ANT", "MAP", "PEN", "INK", "LOG", "MUD", "FOG", "RAT", "FOX", "OWL", "COW", "PIG", "HEN", "BUG", "WEB", "SEA", "SKI", "ZOO", "GYM", "ART"],
    4: ["LUCK", "GOLD", "STAR", "MOON", "FISH", "BIRD", "TREE", "LEAF", "ROCK", "SAND", "WAVE", "WIND", "RAIN", "SNOW", "FIRE", "GAME", "PLAY", "JUMP", "RACE", "TEAM", "GOAL", "KING", "LION", "BEAR", "WOLF", "DEER", "DUCK", "FROG", "CRAB", "SHIP", "BOAT", "CAKE", "MILK", "RICE", "SOUP", "CORN", "BEAN", "MINT", "LIME", "PLUM", "PEAR"],
    5: ["MONEY", "LUCKY", "HAPPY", "SMILE", "MAGIC", "PRIZE", "SCORE", "SHINE", "SNAKE", "DANCE", "PLANT", "STONE", "TIGER", "HOUSE", "MOUSE", "CANDY", "SUGAR", "BRAVE", "CLOUD", "STORM", "WORLD", "LIGHT", "NIGHT", "DREAM", "EAGLE", "ZEBRA", "PANDA", "HEART", "CROWN", "TRAIN", "PLANE", "RIVER", "OCEAN", "BEACH", "GHOST", "ROBOT", "CLOCK", "CHESS", "MUSIC", "PIZZA", "BREAD", "APPLE", "GRAPE", "LEMON", "MANGO"],
    6: ["PLANET", "GOLDEN", "SILVER", "BRONZE", "WINNER", "ROCKET", "CASTLE", "DRAGON", "WIZARD", "GARDEN", "FLOWER", "BASKET", "TICKET", "PUZZLE", "RABBIT", "TURTLE", "SPIDER", "MONKEY", "CAMERA", "GUITAR", "YELLOW", "ORANGE", "PURPLE", "COOKIE", "BURGER", "POTATO", "CARROT", "CHERRY", "BANANA", "SALMON"],
    7: ["RAINBOW", "JACKPOT", "DIAMOND", "FORTUNE", "MYSTERY", "JOURNEY", "CAPTAIN", "WARRIOR", "CRYSTAL", "FANTASY", "HOLIDAY", "FREEDOM", "VICTORY", "HARMONY", "COMPASS", "UNICORN", "PYRAMID", "VOLCANO", "TORNADO"],
    8: ["TREASURE", "FESTIVAL", "CARNIVAL", "SYMPHONY", "ELEPHANT", "MOUNTAIN", "DINOSAUR", "CHAMPION", "STARDUST", "SPARKLES", "FIREWORK"],
};

// Prize is by count of words found (0-8), not which ones. 0 and 1 words found both pay $0
// (merged into one "count: 0" tier). Weights for counts 2-8 are a monotonically decreasing
// geometric ladder (each tier ~2.35x rarer than the one below it) - a prior rebalance had
// count:3's weight (10000) exceeding count:2's (4000), making 3 words *more* likely than 2,
// which should never happen. Re-solved keeping weight(0)=43313 and the overall any-win
// probability (~35%) exactly as before, just fixing the ordering: RTP ~81.1%, jackpot (all 8
// found) ~1-in-823.
export const TIERS: { count: number; value: number; weight: number }[] = [
    { count: 0, value: 0, weight: 43313 },
    { count: 2, value: 5000, weight: 13432 },
    { count: 3, value: 15000, weight: 5726 },
    { count: 4, value: 40000, weight: 2441 },
    { count: 5, value: 100000, weight: 1041 },
    { count: 6, value: 300000, weight: 444 },
    { count: 7, value: 1000000, weight: 189 },
    { count: 8, value: 5000000, weight: 81 },
];

function shuffled<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function randomWordLength(): number {
    return MIN_WORD_LENGTH + crypto.randomInt(0, MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1);
}

interface FilledSlot {
    id: string;
    direction: Direction;
    cells: [number, number][];
    word: string;
}

function inBounds(row: number, col: number): boolean {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function wordCells(startRow: number, startCol: number, direction: Direction, length: number): [number, number][] {
    const cells: [number, number][] = [];
    for (let i = 0; i < length; i++) {
        cells.push(direction === "across" ? [startRow, startCol + i] : [startRow + i, startCol]);
    }
    return cells;
}

// Standard crossword placement validity: every cell in bounds; the cell immediately before
// the start and after the end (in this word's own direction) must be empty (so it doesn't
// run into/merge with another word); any cell that's already lettered must agree exactly
// (a legitimate crossing); any cell that's *not* yet lettered must have empty perpendicular
// neighbors (so it doesn't run parallel-adjacent to an unrelated word with no real crossing).
function canPlace(cellLetters: Map<string, string>, cells: [number, number][], word: string, direction: Direction): boolean {
    for (const [r, c] of cells) {
        if (!inBounds(r, c)) {
            return false;
        }
    }
    const [firstR, firstC] = cells[0];
    const [lastR, lastC] = cells[cells.length - 1];
    const before: [number, number] = direction === "across" ? [firstR, firstC - 1] : [firstR - 1, firstC];
    const after: [number, number] = direction === "across" ? [lastR, lastC + 1] : [lastR + 1, lastC];
    if (inBounds(before[0], before[1]) && cellLetters.has(`${before[0]},${before[1]}`)) {
        return false;
    }
    if (inBounds(after[0], after[1]) && cellLetters.has(`${after[0]},${after[1]}`)) {
        return false;
    }

    for (let i = 0; i < cells.length; i++) {
        const [r, c] = cells[i];
        const key = `${r},${c}`;
        const existing = cellLetters.get(key);
        if (existing) {
            if (existing !== word[i]) {
                return false;
            }
            continue; // legitimate crossing cell - no adjacency check needed
        }
        const n1: [number, number] = direction === "across" ? [r - 1, c] : [r, c - 1];
        const n2: [number, number] = direction === "across" ? [r + 1, c] : [r, c + 1];
        if (inBounds(n1[0], n1[1]) && cellLetters.has(`${n1[0]},${n1[1]}`)) {
            return false;
        }
        if (inBounds(n2[0], n2[1]) && cellLetters.has(`${n2[0]},${n2[1]}`)) {
            return false;
        }
    }
    return true;
}

// Randomized greedy generation: place a first word near the center, then repeatedly pick a
// random already-placed word and a random letter of it, find a same-letter candidate from the
// bank, and place it crossing perpendicularly there if valid - until the target word count is
// reached. Restarts from scratch (fresh random first word) if it gets stuck, which the broad
// word bank makes rare.
function generateGrid(): { cellLetters: Map<string, string>; words: FilledSlot[] } {
    for (let restart = 0; restart < 20; restart++) {
        const cellLetters = new Map<string, string>();
        const words: FilledSlot[] = [];
        const usedWords = new Set<string>();
        let nextId = 0;

        const firstLength = randomWordLength();
        const firstWord = shuffled(WORD_BANK[firstLength] ?? [])[0];
        if (!firstWord) {
            continue;
        }
        const startRow = Math.floor(ROWS / 2);
        const startCol = Math.floor((COLS - firstLength) / 2);
        const firstCells = wordCells(startRow, startCol, "across", firstLength);
        for (let i = 0; i < firstCells.length; i++) {
            const [r, c] = firstCells[i];
            cellLetters.set(`${r},${c}`, firstWord[i]);
        }
        words.push({ id: `W${nextId++}`, direction: "across", cells: firstCells, word: firstWord });
        usedWords.add(firstWord);

        let attempts = 0;
        const MAX_ATTEMPTS = 500;
        while (words.length < TARGET_WORD_COUNT && attempts < MAX_ATTEMPTS) {
            attempts++;
            const base = words[crypto.randomInt(0, words.length)];
            const crossIndex = crypto.randomInt(0, base.cells.length);
            const crossLetter = base.word[crossIndex];
            const [crossRow, crossCol] = base.cells[crossIndex];
            const newDirection: Direction = base.direction === "across" ? "down" : "across";

            const pool = WORD_BANK[randomWordLength()] ?? [];
            const candidate = shuffled(pool).find((w) => !usedWords.has(w) && w.includes(crossLetter));
            if (!candidate) {
                continue;
            }

            const matchIndices: number[] = [];
            for (let i = 0; i < candidate.length; i++) {
                if (candidate[i] === crossLetter) {
                    matchIndices.push(i);
                }
            }
            const j = matchIndices[crypto.randomInt(0, matchIndices.length)];

            const newStartRow = newDirection === "down" ? crossRow - j : crossRow;
            const newStartCol = newDirection === "down" ? crossCol : crossCol - j;
            const newCells = wordCells(newStartRow, newStartCol, newDirection, candidate.length);

            if (!canPlace(cellLetters, newCells, candidate, newDirection)) {
                continue;
            }

            for (let i = 0; i < newCells.length; i++) {
                const [r, c] = newCells[i];
                cellLetters.set(`${r},${c}`, candidate[i]);
            }
            words.push({ id: `W${nextId++}`, direction: newDirection, cells: newCells, word: candidate });
            usedWords.add(candidate);
        }

        if (words.length === TARGET_WORD_COUNT) {
            return { cellLetters, words };
        }
    }
    throw new Error("crossword: failed to generate a grid with the target word count");
}

function letterFrequency(word: string): Record<string, number> {
    const freq: Record<string, number> = {};
    for (const ch of word) {
        freq[ch] = (freq[ch] ?? 0) + 1;
    }
    return freq;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface CrosswordConditions {
    rows: number;
    cols: number;
    grid: { row: number; col: number; letter: string }[];
    words: { id: string; direction: Direction; cells: [number, number][]; word: string; found: boolean }[];
    letters: string[];
    wordsFoundCount: number;
    totalPayout: number;
}

export function generateRound(): CrosswordConditions {
    const { cellLetters, words } = generateGrid();
    const tier = drawPrizeWeight(TIERS);

    // Which `tier.count` of the 8 placed words are the "found" ones - decided first and final,
    // same "outcome fixed before any display is built" shape as every other game here (Kitty
    // Scratch's row wins, Memory's match count). `tier.count`/`tier.value` are the payout, full
    // stop; nothing below this line is allowed to change them, even by coincidence.
    const foundIds = new Set(shuffled(words.map((w) => w.id)).slice(0, tier.count));

    const bagFreq: Record<string, number> = {};
    for (const w of words) {
        if (!foundIds.has(w.id)) {
            continue;
        }
        const freq = letterFrequency(w.word);
        for (const ch of Object.keys(freq)) {
            bagFreq[ch] = (bagFreq[ch] ?? 0) + freq[ch];
        }
    }

    const letters: string[] = [];
    for (const ch of Object.keys(bagFreq)) {
        for (let i = 0; i < bagFreq[ch]; i++) {
            letters.push(ch);
        }
    }
    // Pad with random decoy letters up to the fixed circle count - purely cosmetic filler, same
    // as Kitty Scratch's non-winning row symbols: even if a decoy happens to spell out a word
    // that wasn't drawn as found, it never changes `found`, `wordsFoundCount`, or the payout.
    while (letters.length < CIRCLE_COUNT) {
        letters.push(ALPHABET[crypto.randomInt(0, ALPHABET.length)]);
    }

    const finalWords = words.map((w) => ({ ...w, found: foundIds.has(w.id) }));

    return {
        rows: ROWS,
        cols: COLS,
        grid: Array.from(cellLetters.entries()).map(([key, letter]) => {
            const [row, col] = key.split(",").map(Number);
            return { row, col, letter };
        }),
        words: finalWords.map((w) => ({ id: w.id, direction: w.direction, cells: w.cells, word: w.word, found: w.found })),
        letters: shuffled(letters),
        wordsFoundCount: tier.count,
        totalPayout: tier.value,
    };
}

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;

async function settleRound(round: { _id: string; playerAccountId: number; conditions: CrosswordConditions }): Promise<{ balance?: string }> {
    const { totalPayout } = round.conditions;
    if (totalPayout <= 0) {
        return {};
    }
    const xenCasinoAccountId = await getXenCasinoAccountId();
    const result = await transfer({
        fromAccountId: xenCasinoAccountId,
        toAccountId: round.playerAccountId,
        amount: totalPayout.toFixed(10),
        key: `xendelta-${SLUG}-payout-${round._id}`,
        note: `${SLUG}_win`,
    });
    return { balance: result.toNewBalance };
}

scheduleStaleRoundSweep(SLUG, ROUND_TTL_MS, async (round) => {
    const xenCasinoAccountId = await getXenCasinoAccountId();
    await transfer({
        fromAccountId: round.playerAccountId,
        toAccountId: xenCasinoAccountId,
        amount: round.wager.toFixed(10),
        key: round.debitKey,
        note: `${SLUG}_wager`,
    });
    await settleRound(round);
    await XenCasinoRound.resolve(round._id);
    await recordCasinoRoundPlayed(round.userId, { game: SLUG, wager: round.wager, payout: round.conditions.totalPayout });
});

module.exports = function (app: express.Application) {

    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, function (_req: express.Request, res: express.Response) {
        const totalWeight = TIERS.reduce((sum, t) => sum + t.weight, 0);
        return res.json({
            status: true,
            data: {
                price: PRICE,
                slotCount: TARGET_WORD_COUNT,
                distribution: TIERS.map((t) => ({ wordsFound: t.count, payout: t.value, probability: t.weight / totalWeight })),
                rtp: prizeRtp(PRICE, TIERS),
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/play`, authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const wager = PRICE;

        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            if (Number(resolved.account.balance) < wager) {
                return res.status(400).json({ status: false, message: "Insufficient balance" });
            }

            const conditions = generateRound();

            const roundId = new mongoose.Types.ObjectId();
            const debitKey = `xendelta-${SLUG}-start-${roundId}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    roundId,
                    game: SLUG,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active round on this ticket" });
                }
                throw err;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            let debitBalance: string;
            try {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: wager.toFixed(10),
                    key: debitKey,
                    note: `${SLUG}_wager`,
                });
                debitBalance = result.fromNewBalance;
            } catch (err) {
                if (err instanceof WeeabetsTransferError && err.status === 400) {
                    await XenCasinoRound.resolve(round._id);
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                throw err; // ambiguous - leave round in place, the recovery sweep will retry
            }

            const settled = await settleRound(round);
            await XenCasinoRound.resolve(round._id);
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager, payout: conditions.totalPayout });

            return res.json({
                status: true,
                data: { ...conditions, balance: settled.balance ?? debitBalance },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
