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

// Register the Mongoose model schema before use
require("../src/server/models/xenCasinoRanch");

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/xendelta";

async function repair() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) throw new Error("No db connection");

    const coll = db.collection("xencasinoranches");
    const allDocs = await coll.find({}).toArray();

    console.log(`Found ${allDocs.length} ranch documents`);

    let repaired = 0;
    let totalCreatures = 0;

    for (const raw of allDocs) {
        const creatures: any[] = raw.creatures || [];
        totalCreatures += creatures.length;
        if (creatures.length === 0) continue;

        let needsFix = false;
        const fixed = creatures.map((c: any, i: number) => {
            if (!c._id) {
                console.log(`  Doc ${raw.userId} creature[${i}] "${c.name}" (${c.species}): missing _id, generating one`);
                needsFix = true;
                return { ...c, _id: new mongoose.Types.ObjectId() };
            }
            return c;
        });

        if (!needsFix) {
            console.log(`  Doc ${raw.userId}: all ${creatures.length} creatures OK`);
            continue;
        }

        const result = await coll.updateOne(
            { userId: raw.userId },
            { $set: { creatures: fixed } }
        );
        console.log(`  → Updated: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
        repaired++;
    }

    console.log(`\nRepaired ${repaired} documents (${totalCreatures} total creatures across all docs)`);
    console.log("Done. Creature sub-documents now have stable _id fields.");

    await mongoose.disconnect();
}

repair().catch((err) => {
    console.error("Repair failed:", err);
    process.exit(1);
});
