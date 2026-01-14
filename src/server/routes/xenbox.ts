import express = require("express");
import { authenticateToken } from "../middleware/auth";
import {
  initiateChunkedUpload,
  uploadChunk,
  finalizeChunkedUpload,
  cleanupFailedUpload,
  getUploadSessionStatus,
  checkQuota,
} from "../utils/xenboxUtils";
import { generateSignedUrl } from "../utils/gcsUtils";
import { privateBucket } from "../config/gcs";
import { AuthenticatedRequest } from "../types";
const { XenBoxMedia } = require("../models/xenboxMedia");
const { User } = require("../models/user");

module.exports = function (app: express.Application) {
  // Initiate chunked upload
  app.post("/api/xenbox/initiate", authenticateToken, async function (req: express.Request, res: express.Response) {
    const { filename, totalChunks, fileSize } = req.body;
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

    if (!fileSize || fileSize < 1) {
      return res.status(400).json({
        status: false,
        message: "File size is required",
      });
    }

    // Check quota before initiating upload
    const quotaCheck = await checkQuota(userId, fileSize);
    if (!quotaCheck.canUpload) {
      return res.status(403).json({
        status: false,
        message: quotaCheck.message || "Quota exceeded",
      });
    }

    const uploadId = await initiateChunkedUpload(userId, filename, totalChunks);

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

    await uploadChunk(uploadId, chunkIndex, chunkBuffer);

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

    await cleanupFailedUpload(uploadId);

    return res.json({
      status: true,
      message: "Upload session cancelled",
    });
  });

  // List user's xenbox files
  app.get("/api/xenbox/files", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const search = req.query.search as string | undefined;

    // Build query - only files uploaded by this user
    // Note: location check is redundant since we're querying XenBoxMedia collection
    const query: any = { uploadedBy: userId };

    // Add search filter if provided
    if (search && search.trim()) {
      query.filename = { $regex: search.trim(), $options: "i" };
    }

    const files = await XenBoxMedia.find(query)
      .sort({ createdAt: -1 })
      .select("_id location filename mimeType size uploadedBy createdAt shareToken password expiry")
      .exec();

    // Format files for response
    const formattedFiles = files.map((file: any) => ({
      _id: file._id.toString(),
      location: file.location,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      uploadedBy: file.uploadedBy.toString(),
      createdAt: file.createdAt.toISOString(),
      shareToken: file.shareToken,
      hasPassword: !!file.password,
      password: file.password || null, // Return plain text password
      expiry: file.expiry ? file.expiry.toISOString() : null,
    }));

    return res.json({
      status: true,
      data: { files: formattedFiles },
    });
  });

  // Get signed URL for xenbox file
  app.get("/api/xenbox/files/:fileId/url", authenticateToken, async function (req: express.Request, res: express.Response) {
    const fileId = req.params.fileId;
    const userId = (req as AuthenticatedRequest).user!._id.toString();

    // Find file and verify ownership
    const file = await XenBoxMedia.findById(fileId).exec();
    if (!file) {
      return res.status(404).json({
        status: false,
        message: "File not found",
      });
    }

    if (file.uploadedBy.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    // Generate signed URL
    const gcsPath = `xenbox/${userId}/${file.filename}`;
    const signedUrl = await generateSignedUrl(gcsPath, 15); // 15 minutes expiry

    return res.json({
      status: true,
      data: { url: signedUrl },
    });
  });

  // Update file settings (password/expiry)
  app.put("/api/xenbox/files/:fileId/settings", authenticateToken, async function (req: express.Request, res: express.Response) {
    const fileId = req.params.fileId;
    const userId = (req as AuthenticatedRequest).user!._id.toString();
    const { password, expiry } = req.body;

    // Find file and verify ownership
    const file = await XenBoxMedia.findById(fileId).exec();
    if (!file) {
      return res.status(404).json({
        status: false,
        message: "File not found",
      });
    }

    if (file.uploadedBy.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    // Update password if provided
    if (password !== undefined) {
      if (password === "" || password === null) {
        // Remove password
        file.password = undefined;
      } else {
        // Set new password (plain text)
        file.password = password;
      }
    }

    // Update expiry if provided
    if (expiry !== undefined) {
      if (expiry === "" || expiry === null) {
        // Remove expiry
        file.expiry = undefined;
      } else {
        // Set expiry date
        file.expiry = new Date(expiry);
      }
    }

    await file.save();

    return res.json({
      status: true,
      message: "File settings updated successfully",
      data: {
        hasPassword: !!file.password,
        password: file.password || null, // Return plain text password
        expiry: file.expiry ? file.expiry.toISOString() : null,
        shareUrl: `${req.protocol}://${req.get("host")}/xenbox/${file.shareToken}`,
      },
    });
  });

  // Public file info endpoint (no authentication required)
  app.get("/api/xenbox/info/:shareToken", async function (req: express.Request, res: express.Response) {
    const shareToken = req.params.shareToken;

    // Find file by share token
    const file = await XenBoxMedia.findOne({ shareToken }).exec();
    if (!file) {
      return res.status(404).json({
        status: false,
        message: "File not found",
      });
    }

    // Check if file is expired
    if (file.isExpired()) {
      return res.status(403).json({
        status: false,
        message: "Link expired",
        isExpired: true,
      });
    }

    return res.json({
      status: true,
      data: {
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        requiresPassword: !!file.password,
        expiry: file.expiry ? file.expiry.toISOString() : null,
      },
    });
  });

  // Public file download endpoint (no authentication required)
  app.get("/api/xenbox/download/:shareToken", async function (req: express.Request, res: express.Response) {
    const shareToken = req.params.shareToken;
    const { password } = req.query;

    // Find file by share token
    const file = await XenBoxMedia.findOne({ shareToken }).exec();
    if (!file) {
      return res.status(404).json({
        status: false,
        message: "File not found",
      });
    }

    // Check if file is expired
    if (file.isExpired()) {
      return res.status(403).json({
        status: false,
        message: "Link expired",
      });
    }

    // Check password if file has one
    if (file.password) {
      if (!password || typeof password !== "string") {
        return res.status(401).json({
          status: false,
          message: "Password required",
          requiresPassword: true,
          filename: file.filename,
          expiry: file.expiry ? file.expiry.toISOString() : null,
        });
      }

      if (!file.validPassword(password)) {
        return res.status(401).json({
          status: false,
          message: "Incorrect password",
          requiresPassword: true,
          filename: file.filename,
          expiry: file.expiry ? file.expiry.toISOString() : null,
        });
      }
    }

    // File is valid, stream it from GCS
    const userId = file.uploadedBy.toString();
    const gcsPath = `xenbox/${userId}/${file.filename}`;
    const gcsFile = privateBucket.file(gcsPath);

    // Check if file exists
    const [exists] = await gcsFile.exists();
    if (!exists) {
      return res.status(404).json({
        status: false,
        message: "File not found in storage",
      });
    }

    // Set headers for file download
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Content-Length", file.size);
    // Add expiry info to headers if available
    if (file.expiry) {
      res.setHeader("X-File-Expiry", file.expiry.toISOString());
    }

    // Stream file from GCS
    gcsFile.createReadStream().pipe(res);
  });

  // Delete xenbox file
  app.delete("/api/xenbox/files/:fileId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const fileId = req.params.fileId;
    const userId = (req as AuthenticatedRequest).user!._id.toString();

    // Find file and verify ownership
    const file = await XenBoxMedia.findById(fileId).exec();
    if (!file) {
      return res.status(404).json({
        status: false,
        message: "File not found",
      });
    }

    if (file.uploadedBy.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    // Delete from database (pre-delete hook will handle GCS deletion)
    await XenBoxMedia.findByIdAndDelete(fileId);

    // Remove from user's files array
    await User.findByIdAndUpdate(userId, {
      $pull: { "xenbox.files": fileId },
    });

    return res.json({
      status: true,
      message: "File deleted successfully",
    });
  });
};
