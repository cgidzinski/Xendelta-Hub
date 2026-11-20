import { z } from "zod";
import { isJournalDate } from "./pages";

export const propertyTypes = ["text", "number", "date", "select", "status"] as const;
export const propertyStatuses = ["To do", "In progress", "Done"] as const;
const key = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _-]+$/u)
  .transform((v) => v.toLowerCase());
const text = z.string().trim().max(300);
const date = z.string().refine(isJournalDate, "Choose a valid date");
const choice = z.string().trim().min(1).max(80);

export const pagePropertySchema = z
  .discriminatedUnion("type", [
    z.object({ key, type: z.literal("text"), value: text }),
    z.object({ key, type: z.literal("number"), value: z.number() }),
    z.object({ key, type: z.literal("date"), value: date }),
    z.object({ key, type: z.literal("select"), value: choice, options: z.array(choice).min(1).max(20) }),
    z.object({ key, type: z.literal("status"), value: z.enum(propertyStatuses) }),
  ])
  .superRefine((property, context) => {
    if (property.type === "select" && !property.options.includes(property.value)) {
      context.addIssue({ code: "custom", path: ["value"], message: "Choose one of the listed options" });
    }
  });

export const pagePropertiesSchema = z.object({
  properties: z
    .array(pagePropertySchema)
    .max(30)
    .refine(
      (rows) => new Set(rows.map((row) => row.key)).size === rows.length,
      "Each property must have a different name",
    ),
});

export const pageQuerySchema = z
  .object({
    key,
    type: z.enum(propertyTypes),
    operator: z.enum(["equals", "atLeast", "atMost", "exists"]),
    value: z.union([z.string().max(300), z.number()]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine(({ type, operator, value }) => {
    if (operator === "exists") return value === undefined;
    if (type === "number") return typeof value === "number";
    if (type === "date") return typeof value === "string" && isJournalDate(value);
    if (operator !== "equals" || typeof value !== "string") return false;
    return type !== "status" || propertyStatuses.some((status) => value === status);
  }, "Choose a filter appropriate for the property type");

export type PageProperty = z.infer<typeof pagePropertySchema>;
export type PagePropertyQuery = z.infer<typeof pageQuerySchema>;
