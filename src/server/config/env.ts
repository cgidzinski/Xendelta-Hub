import { z } from "zod";

// The variables the server cannot run without. Everything else (OAuth, GCS, Resend, VAPID,
// Bugsnag, ...) is optional and degrades one feature, so it is not enforced here.
const requiredSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
});

/** Call once at boot. Exits the process with a readable message instead of limping along. */
export function validateEnv(): void {
  const result = requiredSchema.safeParse(process.env);
  if (result.success) return;
  console.error(">>> Invalid environment:");
  for (const issue of result.error.issues) console.error(`>>>   ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

/** The JWT signing secret. Never falls back to a default: a guessable secret forges logins. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}
