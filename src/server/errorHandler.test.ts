import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { AppError, errorHandler } from "./utils/http";

// Express decides a function is an ERROR handler purely by its arity: exactly four parameters.
// Drop an "unused" `next` (an editor or an auto-fixer will happily do it) and the handler becomes
// ordinary middleware that runs for every request with the request object as its "error",
// turning every page into a 500. Nothing type-checks that, so pin it here.
describe("errorHandler", () => {
  it("keeps four parameters so Express treats it as an error handler", () => {
    expect(errorHandler.length).toBe(4);
  });

  const appThatThrows = (error: unknown) => {
    const app = express();
    app.get("/boom", async () => {
      throw error;
    });
    app.get("/ok", (_req, res) => {
      res.json({ fine: true });
    });
    app.use(errorHandler);
    return app;
  };

  it("does not interfere with requests that succeed", async () => {
    const res = await request(appThatThrows(new Error("x"))).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fine: true });
  });

  it("turns an AppError into its status and a { status, message } body", async () => {
    const res = await request(appThatThrows(new AppError(404, "Group not found"))).get("/boom");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: false, message: "Group not found" });
  });

  it("answers any other error with a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(appThatThrows(new Error("kaboom"))).get("/boom");
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
