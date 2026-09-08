/**
 * Config for ts-migrate-mongoose (see package.json `db:migrate*` scripts).
 *
 * The connection string is read from MONGODB_URI so there is a single source of
 * truth — the same var the app and scripts/db-backup.ts use. Prod and staging each
 * point at their own Mongo DB via their own .env, so `npm run db:migrate` on either
 * box migrates that box's database.
 */
require("dotenv").config({ quiet: true });

import type { ConfigOptions } from "ts-migrate-mongoose";

const config: ConfigOptions = {
  uri: process.env.MONGODB_URI,
  collection: "migrations", // tracking collection
  migrationsPath: "./migrations",
  templatePath: "./migrations/template.ts",
  autosync: true, // register new migration files without an interactive prompt (CI + on-boot)
};

export default config;
