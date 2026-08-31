import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { listCatalogueBrands, searchCatalogue } from "../utils/paintCatalogue";

// Read-only lookup over the shared paint catalogue.
//
// The catalogue is a committed JSON held in memory (see utils/paintCatalogue.ts), so these
// handlers touch no database at all. Search runs server-side rather than shipping the file to
// the browser: half a megabyte of reference data has no business in a bundle that is already
// around 2MB, nor in the PWA precache.
//
// Mounted on its own top-level prefix so it can never be shadowed by /api/paints/:paintId,
// whatever order the route files are required in.

module.exports = function (app: express.Application) {
  app.get("/api/paint-catalogue", authenticateToken, function (req: express.Request, res: express.Response) {
    const paints = searchCatalogue({
      q: req.query.q as string | undefined,
      brand: req.query.brand as string | undefined,
      range: req.query.range as string | undefined,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });

    return res.json({
      status: true,
      data: { paints },
    });
  });

  app.get("/api/paint-catalogue/brands", authenticateToken, function (_req: express.Request, res: express.Response) {
    return res.json({
      status: true,
      data: { brands: listCatalogueBrands() },
    });
  });
};
