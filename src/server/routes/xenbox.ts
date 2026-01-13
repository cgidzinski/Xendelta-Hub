import express = require("express");
import { authenticateToken } from "../middleware/auth";
import {
  initiateChunkedUpload,
  uploadChunk,
  finalizeChunkedUpload,
  cleanupFailedUpload,
  getUploadSessionStatus,
} from "../utils/xenboxUtils";
import { deleteFromGCS } from "../utils/gcsUtils";
import { AuthenticatedRequest } from "../types";
import { XENBOX_CHUNK_SIZE } from "../constants";

module.exports = function (app: express.Application) {
  // Initiate chunked upload
  app.post("/api/xenbox/initiate", authenticateToken, async function (req: express.Request, res: express.Response) {
    const { filename, totalChunks } = req.body;
    const userId = (req as AuthenticatedRequest).user!._id.toString();

    if (!filename) {
      return res.status(400).json({
        status: false,
        message: "Filename is required",
      });
    }

    if (!totalChunks || totalChunks < 1) {
      return res.status(400).json({
        status: false,
        message: "Total chunks must be a positive number",
      });
    }

    const uploadId = initiateChunkedUpload(userId, filename, totalChunks);

    return res.json({
      status: true,
      message: "Upload session initiated",
      data: { uploadId },
    });
  });

  // Upload a chunk
  app.post("/api/xenbox/chunk", authenticateToken, async function (req: express.Request, res: express.Response) {
    const uploadId = req.body.uploadId as string;
    const chunkIndex = parseInt(req.body.chunkIndex as string);
    const totalChunks = parseInt(req.body.totalChunks as string);
    const chunkData = req.body.chunkData;

    if (!uploadId) {
      return res.status(400).json({
        status: false,
        message: "Upload ID is required",
      });
    }

    if (chunkIndex === undefined || isNaN(chunkIndex)) {
      return res.status(400).json({
        status: false,
        message: "Chunk index is required",
      });
    }

    if (!chunkData) {
      return res.status(400).json({
        status: false,
        message: "Chunk data is required",
      });
    }

    // Convert base64 chunk data to buffer
    let chunkBuffer: Buffer;
    if (typeof chunkData === "string") {
      chunkBuffer = Buffer.from(chunkData, "base64");
    } else if (Buffer.isBuffer(chunkData)) {
      chunkBuffer = chunkData;
    } else {
      return res.status(400).json({
        status: false,
        message: "Invalid chunk data format",
      });
    }

    uploadChunk(uploadId, chunkIndex, chunkBuffer);

    return res.json({
      status: true,
      message: "Chunk uploaded successfully",
      data: { chunkIndex },
    });
  });

  // Finalize chunked upload
  app.post("/api/xenbox/finalize", authenticateToken, async function (req: express.Request, res: express.Response) {
    const uploadId = req.body.uploadId as string;

    if (!uploadId) {
      return res.status(400).json({
        status: false,
        message: "Upload ID is required",
      });
    }

    const fileData = await finalizeChunkedUpload(uploadId);

    return res.json({
      status: true,
      message: "File uploaded successfully",
      data: fileData,
    });
  });

  // Get upload session status
  app.get("/api/xenbox/status/:uploadId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const uploadId = req.params.uploadId;

    const status = getUploadSessionStatus(uploadId);
    if (!status) {
      return res.status(404).json({
        status: false,
        message: "Upload session not found",
      });
    }

    return res.json({
      status: true,
      data: status,
    });
  });

  // Cancel/cleanup failed upload
  app.delete("/api/xenbox/:uploadId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const uploadId = req.params.uploadId;

    cleanupFailedUpload(uploadId);

    return res.json({
      status: true,
      message: "Upload session cancelled",
    });
  });

  // List user's xenbox files (placeholder - would need a database to track files)
  app.get("/api/xenbox/files", authenticateToken, async function (req: express.Request, res: express.Response) {
    // TODO: Implement file listing from database or GCS
    // For now, return empty list
    return res.json({
      status: true,
      data: { files: [] },
    });
  });

  // Delete xenbox file
  app.delete("/api/xenbox/files/:fileId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const fileId = req.params.fileId;
    const userId = (req as AuthenticatedRequest).user!._id.toString();

    // Delete from private GCS bucket
    const gcsPath = `xenbox/${userId}/${fileId}`;
    await deleteFromGCS(gcsPath, true).catch(() => {
      // Ignore errors if file doesn't exist
    });

    return res.json({
      status: true,
      message: "File deleted successfully",
    });
  });
};
