import { describe, it, expect } from "vitest";
import { isDeleted, liveOnly, deletedOnly } from "./softDelete";

describe("isDeleted", () => {
    it("treats a missing field as live - records predate soft deletion", () => {
        expect(isDeleted({})).toBe(false);
    });

    it("treats an explicit null as live - that is the schema default", () => {
        expect(isDeleted({ deleted_at: null })).toBe(false);
    });

    it("treats undefined as live", () => {
        expect(isDeleted({ deleted_at: undefined })).toBe(false);
    });

    it("recognises a Date and an ISO string alike", () => {
        expect(isDeleted({ deleted_at: new Date("2025-06-01T00:00:00.000Z") })).toBe(true);
        expect(isDeleted({ deleted_at: "2025-06-01T00:00:00.000Z" })).toBe(true);
    });

    it("does not use truthiness - the epoch is a real deletion time", () => {
        // A `!!row.deleted_at` check would call this live.
        expect(isDeleted({ deleted_at: new Date(0) })).toBe(true);
        expect(isDeleted({ deleted_at: "" })).toBe(true);
    });
});

describe("liveOnly / deletedOnly", () => {
    const rows = [
        { id: "a" },
        { id: "b", deleted_at: "2025-06-01T00:00:00.000Z" },
        { id: "c", deleted_at: null },
    ];

    it("partitions the list without overlap or loss", () => {
        expect(liveOnly(rows).map((r) => r.id)).toEqual(["a", "c"]);
        expect(deletedOnly(rows).map((r) => r.id)).toEqual(["b"]);
        expect(liveOnly(rows).length + deletedOnly(rows).length).toBe(rows.length);
    });

    it("does not mutate its input", () => {
        liveOnly(rows);
        expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    });
});
