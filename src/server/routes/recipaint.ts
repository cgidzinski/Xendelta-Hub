import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { uploadRecipaintAsset as multerUploadRecipaintAsset } from "../config/multer";
import { uploadRecipaintAsset, generateUniqueFilename } from "../utils/mediaUtils";
import { deleteFromGCS } from "../utils/gcsUtils";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  // Upload recipaint asset endpoint
  app.post("/api/recipaint/upload-asset", authenticateToken, multerUploadRecipaintAsset.single("asset"), async function (req: express.Request, res: express.Response) {
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "No asset file provided",
      });
    }

    // Generate unique filename
    const filename = generateUniqueFilename(req.file.originalname);
    
    // Upload to public GCS and get direct URL
    const assetData = await uploadRecipaintAsset(req.file, filename);

    return res.json({
      status: true,
      message: "Asset uploaded successfully",
      data: {
        url: assetData.url,
        filename: assetData.filename,
        mimeType: assetData.mimeType,
        size: assetData.size,
      },
    });
  });

  // Delete recipaint asset endpoint
  app.delete("/api/recipaint/asset", authenticateToken, async function (req: express.Request, res: express.Response) {
    const assetUrl = req.query.assetUrl as string;
    
    if (!assetUrl) {
      return res.status(400).json({
        status: false,
        message: "Asset URL is required",
      });
    }

    // Delete from public GCS
    const urlParts = assetUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const gcsPath = `recipaint-assets/${filename}`;
    await deleteFromGCS(gcsPath).catch(() => {
      // Ignore errors if file doesn't exist
    });

    return res.json({
      status: true,
      message: "Asset deleted successfully",
    });
  });
};
