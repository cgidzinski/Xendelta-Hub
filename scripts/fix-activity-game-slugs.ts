/**
 * One-time migration to fix XenCasinoActivity game slugs so the Games tab
 * in the admin panel correctly includes all historical activity.
 *
 * Run: npx tsx scripts/fix-activity-game-slugs.ts
 *
 * Fixes:
 *   1. game: "mine"   → game: "cheddar-ranch"
 *   2. game: "garden" → game: "cheddar-ranch"
 *   3. game: /^quest-reward-/ → game: "quest-reward"
 *
 * Dry-run first (no --apply flag) to see what would change.
 * Add --apply to actually update the database.
 */

require("dotenv").config({ quiet: true });

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/xendelta";

interface ActivityDoc {
    _id: mongoose.Types.ObjectId;
    game: string;
}

async function run(apply: boolean) {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");
    const db = mongoose.connection.db!;
    const collection = db.collection("xencasinoactivities");

    // 1. Fix mine → cheddar-ranch
    const mineCount = await collection.countDocuments({ game: "mine" });
    console.log(`\n[mine → cheddar-ranch] ${mineCount} document(s) found`);
    if (mineCount > 0 && apply) {
        const result = await collection.updateMany(
            { game: "mine" },
            { $set: { game: "cheddar-ranch" } }
        );
        console.log(`  Updated ${result.modifiedCount} document(s)`);
    }

    // 2. Fix garden → cheddar-ranch
    const gardenCount = await collection.countDocuments({ game: "garden" });
    console.log(`[garden → cheddar-ranch] ${gardenCount} document(s) found`);
    if (gardenCount > 0 && apply) {
        const result = await collection.updateMany(
            { game: "garden" },
            { $set: { game: "cheddar-ranch" } }
        );
        console.log(`  Updated ${result.modifiedCount} document(s)`);
    }

    // 3. Fix quest-reward-<key> → quest-reward
    const questCount = await collection.countDocuments({
        game: { $regex: /^quest-reward-/ },
    });
    console.log(`[quest-reward-* → quest-reward] ${questCount} document(s) found`);
    if (questCount > 0 && apply) {
        const result = await collection.updateMany(
            { game: { $regex: /^quest-reward-/ } },
            { $set: { game: "quest-reward" } }
        );
        console.log(`  Updated ${result.modifiedCount} document(s)`);
    }

    const total = mineCount + gardenCount + questCount;

    if (!apply) {
        console.log(
            `\n--- DRY RUN (no changes made) ---\n` +
            `Total documents that would be updated: ${total}\n` +
            `Run with --apply to apply changes.`
        );
    } else {
        console.log(`\n--- DONE ---\nTotal documents updated: ${total}`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

const apply = process.argv.includes("--apply");
run(apply).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
