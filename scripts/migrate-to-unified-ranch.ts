/**
 * Migrate existing data from 4 separate XenCasino collections into the unified
 * XenCasinoRanch collection.
 *
 * Run: npx tsx scripts/migrate-to-unified-ranch.ts
 *
 * Collections migrated:
 *   XenCasinoRanchCreature  → XenCasinoRanch.creatures[]
 *   XenCasinoRanchInventory → XenCasinoRanch.inventory Map
 *   XenCasinoMineState      → XenCasinoRanch.mine {}
 *   XenCasinoGardenState    → XenCasinoRanch.garden.squares[]
 *
 * This script reads all docs from each collection, merges by userId, and writes
 * into the new unified model. Old collections are NOT deleted - verify the new
 * data first, then drop manually.
 */

require("dotenv").config({ quiet: true });

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/xendelta";

function emptyGardenSquares() {
    return Array.from({ length: 9 }, (_, i) => ({ squareId: i, status: "empty" }));
}

async function migrate() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) throw new Error("No db connection");

    // Read old collections
    const oldCreatures = await db.collection("xencasinoranchcreatures").find({}).toArray();
    const oldInventories = await db.collection("xencasinoranchinventories").find({}).toArray();
    const oldMines = await db.collection("xencasinominesstates").find({}).toArray();
    const oldGardens = await db.collection("xencasinogardenstates").find({}).toArray();

    console.log(`Found: ${oldCreatures.length} creatures, ${oldInventories.length} inventories, ${oldMines.length} mine states, ${oldGardens.length} garden states`);

    // Index by userId
    const byUser: Record<string, any> = {};

    for (const c of oldCreatures) {
        const uid = String(c.userId);
        if (!byUser[uid]) byUser[uid] = { creatures: [], inventory: {}, mine: null, garden: null };
        byUser[uid].creatures.push({
            _id: c._id,
            species: c.species,
            name: c.name,
            rarityTier: c.rarityTier,
            stats: c.stats || { speed: 0, stamina: 0, power: 0, intelligence: 0, luck: 0, charm: 0 },
            lastFedAt: c.lastFedAt || null,
            feedCount: c.feedCount || 0,
            raceWins: c.raceWins || 0,
            raceLosses: c.raceLosses || 0,
            decayTicksApplied: c.decayTicksApplied || 0,
            lastCollectedAt: c.lastCollectedAt || null,
            lastCollectDate: c.lastCollectDate || null,
            collectStreak: c.collectStreak || 0,
            decayShieldUntil: c.decayShieldUntil || null,
            createdAt: c.createdAt || new Date(),
        });
    }

    for (const inv of oldInventories) {
        const uid = String(inv.userId);
        if (!byUser[uid]) byUser[uid] = { creatures: [], inventory: {}, mine: null, garden: null };
        if (inv.items instanceof Map) {
            inv.items.forEach((v: number, k: string) => { byUser[uid].inventory[k] = v; });
        } else if (typeof inv.items === "object") {
            Object.assign(byUser[uid].inventory, inv.items);
        }
    }

    for (const mine of oldMines) {
        const uid = String(mine.userId);
        if (!byUser[uid]) byUser[uid] = { creatures: [], inventory: {}, mine: null, garden: null };
        byUser[uid].mine = {
            positionX: mine.positionX || 0,
            positionY: mine.positionY || 0,
            dugTiles: (mine.dugTiles || []).map((t: any) => ({
                x: t.x, y: t.y,
                oreTier: t.oreTier || null,
                isHeavyStone: !!t.isHeavyStone,
                status: t.status || "mined",
            })),
            actionsToday: mine.digsToday || 0,
            actionsDate: mine.digsDate || null,
            ladderGrantDate: mine.ladderGrantDate || null,
            ladderCount: mine.ladderCount ?? 3,
            explosiveCount: mine.explosiveCount || 0,
            deepestDepthReached: mine.deepestDepthReached || 0,
            bestGemTier: mine.bestGemTier || null,
            reinforcementCount: mine.reinforcementCount || 0,
        };
    }

    for (const garden of oldGardens) {
        const uid = String(garden.userId);
        if (!byUser[uid]) byUser[uid] = { creatures: [], inventory: {}, mine: null, garden: null };
        byUser[uid].garden = { squares: garden.squares || emptyGardenSquares() };
    }

    // Write to new collection
    const newColl = db.collection("xencasinoranches");
    let inserted = 0;

    for (const [userId, data] of Object.entries(byUser)) {
        const doc = {
            userId,
            creatures: data.creatures,
            inventory: data.inventory,
            mine: data.mine || {
                positionX: 0, positionY: 0, dugTiles: [],
                actionsToday: 0, actionsDate: null, ladderGrantDate: null,
                ladderCount: 3, explosiveCount: 0, deepestDepthReached: 0,
                bestGemTier: null, reinforcementCount: 0,
            },
            garden: data.garden || { squares: emptyGardenSquares() },
        };

        await newColl.updateOne(
            { userId },
            { $set: doc },
            { upsert: true }
        );
        inserted++;
    }

    console.log(`Migrated ${inserted} users to xencasinoranches`);

    // Verify counts
    const newCount = await newColl.countDocuments();
    const newCreatureCount = await newColl.aggregate([
        { $unwind: "$creatures" },
        { $count: "total" }
    ]).toArray();

    console.log(`New collection: ${newCount} docs, ${newCreatureCount[0]?.total || 0} creatures`);
    console.log(`Old: ${oldCreatures.length} creatures, ${oldInventories.length} inventories, ${oldMines.length} mines, ${oldGardens.length} gardens`);
    console.log("Migration complete. Verify data, then drop old collections manually:");
    console.log("  db.xencasinoranchcreatures.drop()");
    console.log("  db.xencasinoranchinventories.drop()");
    console.log("  db.xencasinominesstates.drop()");
    console.log("  db.xencasinogardenstates.drop()");

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
