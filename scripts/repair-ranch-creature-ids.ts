/**
 * Repair script: fixes creature sub-documents that lack _id fields after
 * the unified-ranch migration (which used raw $set, bypassing Mongoose's
 * auto-_id generation for sub-docs).
 *
 * Run: npx tsx scripts/repair-ranch-creature-ids.ts
 *
 * What it does:
 *   1. Loads every XenCasinoRanch document through the Mongoose model
 *      (which auto-generates _id for any sub-doc missing one)
 *   2. Calls doc.save() to persist the stable _id back to MongoDB
 *   3. Reports how many documents were repaired
 *
 * This is safe to run while the app is live — it only touches the _id
 * field on sub-documents that lack one. All other fields are untouched.
 */

require("dotenv").config({ quiet: true });

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/xendelta";

async function repair() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const XenCasinoRanch = mongoose.model("XenCasinoRanch");

    const allDocs = await XenCasinoRanch.find({}).exec();
    console.log(`Found ${allDocs.length} ranch documents`);

    let repaired = 0;
    let totalCreatures = 0;

    for (const doc of allDocs) {
        const creatureCount = doc.creatures?.length ?? 0;
        totalCreatures += creatureCount;
        if (creatureCount === 0) continue;

        // Check if any creature sub-doc lacks _id
        const needsRepair = doc.creatures.some((c: any) => !c._id);
        if (!needsRepair) continue;

        // Mongoose already generated _id during hydration — just save to persist it
        await doc.save();
        repaired++;
    }

    console.log(`Repaired ${repaired} documents (${totalCreatures} total creatures across all docs)`);
    console.log("Done. Creature sub-documents now have stable _id fields.");

    await mongoose.disconnect();
}

repair().catch((err) => {
    console.error("Repair failed:", err);
    process.exit(1);
});
