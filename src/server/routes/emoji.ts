import type { Application, NextFunction, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { uploadEmoji } from "../config/multer";
import { Community } from "../models/community";
import { Conversation } from "../models/conversation";
import { CustomEmojiModel, type CustomEmojiDocument } from "../models/customEmoji";
import { hasPermission } from "../communities/policy";
import { loadCommunity, communityMemberIds } from "../communities/service";
import { realtime } from "../realtime";
import { deleteFromGCS, uploadToGCS } from "../utils/gcsUtils";
import { AppError, callerId } from "../utils/http";
import { validate, validateParams, emojiParamSchema, renameEmojiSchema, uploadEmojiSchema } from "../utils/validation";
import { CUSTOM_EMOJI_MAX_PER_SCOPE, CUSTOM_EMOJI_SIZE, type CustomEmoji } from "@shared/emoji";

// Custom emoji: pictures a community or a group chat uploads. Who may add or remove them:
//   a community   people with the manage emoji permission
//   a group chat  any member adds; the one who added it, or the chat's owner, removes or renames it
// API keys cannot reach /api/emoji (shared/apiKeys.ts lists the apps they can).

const IMMUTABLE = "public, max-age=31536000, immutable";
const EXTENSION: Record<string, string> = { "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

const wire = (e: CustomEmojiDocument): CustomEmoji => ({
  _id: String(e._id),
  name: e.name,
  url: e.url,
  animated: !!e.animated,
  scope: e.communityId ? { type: "community", id: e.communityId } : { type: "chat", id: e.conversationId ?? "" },
  createdBy: e.createdBy,
});

/** Where an emoji lives, who may change it, and who should hear about a change. */
interface Scope {
  key: { communityId: string } | { conversationId: string };
  id: string;
  /** May this person add one here? */
  canAdd: boolean;
  /** May this person rename or delete an emoji that `createdBy` added? */
  canChange: (createdBy: string) => boolean;
  audience: string[];
}

async function scopeOf(me: string, type: "community" | "chat", id: string): Promise<Scope> {
  if (type === "community") {
    const community = await loadCommunity(id, me);
    const manage = hasPermission(community, me, "manageEmoji");
    return {
      key: { communityId: id },
      id,
      canAdd: manage,
      canChange: () => manage,
      audience: communityMemberIds(community),
    };
  }
  // A chat that is not a channel: it is found by its members, so a channel or someone else's chat is a 404.
  const chat = await Conversation.findOne({ _id: id, communityId: { $exists: false }, "members.user_id": me }).exec();
  if (!chat) throw new AppError(404, "Chat not found");
  const owner = chat.members.find((m) => m.role === "owner")?.user_id;
  return {
    key: { conversationId: id },
    id,
    canAdd: true,
    canChange: (createdBy) => createdBy === me || owner === me,
    audience: chat.members.map((m) => m.user_id),
  };
}

const scopeOfEmoji = (me: string, e: CustomEmojiDocument) =>
  e.communityId ? scopeOf(me, "community", e.communityId) : scopeOf(me, "chat", e.conversationId ?? "");

/** A picture that is too big is a 400 with a sentence, not a crash. */
const receivePicture = (req: Request, res: Response, next: NextFunction) =>
  uploadEmoji.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new AppError(400, err.code === "LIMIT_FILE_SIZE" ? "That picture is too big" : err.message));
    }
    next(err);
  });

module.exports = function (app: Application) {
  // Every custom emoji the caller can use: those of their communities and of their chats.
  app.get("/api/emoji", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const [communities, chats] = await Promise.all([
      Community.find({ "members.user_id": me }, "_id").lean().exec(),
      Conversation.find({ "members.user_id": me, communityId: { $exists: false } }, "_id")
        .lean()
        .exec(),
    ]);
    const emoji = await CustomEmojiModel.find({
      $or: [
        { communityId: { $in: communities.map((c) => String(c._id)) } },
        { conversationId: { $in: chats.map((c) => String(c._id)) } },
      ],
    })
      .sort({ name: 1 })
      .exec();
    ok(res, { emoji: emoji.map(wire) });
  });

  // Add one: a picture (PNG, GIF or WebP) and a name. The picture is shrunk to fit a small square.
  app.post(
    "/api/emoji",
    authenticateToken,
    receivePicture,
    validate(uploadEmojiSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { name, scopeType, scopeId } = uploadEmojiSchema.parse(req.body);
      if (!req.file) throw new AppError(400, "Choose a picture");
      const scope = await scopeOf(me, scopeType, scopeId);
      if (!scope.canAdd) throw new AppError(403, "You can't add emoji here");
      if ((await CustomEmojiModel.countDocuments(scope.key).exec()) >= CUSTOM_EMOJI_MAX_PER_SCOPE) {
        throw new AppError(400, `There can be at most ${CUSTOM_EMOJI_MAX_PER_SCOPE} emoji here`);
      }
      if (await CustomEmojiModel.exists({ ...scope.key, name }))
        throw new AppError(400, `There is already an emoji called :${name}:`);

      // Check it really is a picture (the declared type can lie), and shrink it. A moving picture stays moving.
      let processed: Buffer;
      let animated = false;
      try {
        const source = sharp(req.file.buffer, { animated: true });
        animated = ((await source.metadata()).pages ?? 1) > 1;
        const resized = source.resize(CUSTOM_EMOJI_SIZE, CUSTOM_EMOJI_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        });
        processed = await (
          req.file.mimetype === "image/gif"
            ? resized.gif()
            : req.file.mimetype === "image/webp"
              ? resized.webp({ quality: 85 })
              : resized.png({ compressionLevel: 9 })
        ).toBuffer();
      } catch {
        throw new AppError(400, "That file isn't a picture we can use");
      }

      const id = new Types.ObjectId();
      const storagePath = `emoji/${scope.id}/${id}.${EXTENSION[req.file.mimetype]}`;
      // A storage problem is ours, not theirs: say so plainly and keep the details in the log.
      let url: string;
      try {
        url = (await uploadToGCS(processed, storagePath, req.file.mimetype, false, IMMUTABLE)) as string;
      } catch (error) {
        console.error("Emoji upload failed:", error);
        throw new AppError(502, "Couldn't save the picture. Try again in a moment.");
      }
      let doc: CustomEmojiDocument;
      try {
        doc = await CustomEmojiModel.create({ _id: id, ...scope.key, name, url, storagePath, animated, createdBy: me });
      } catch (error: any) {
        // Someone took the name between the check above and now: don't leave the picture behind.
        await deleteFromGCS(storagePath).catch(() => undefined);
        if (error?.code === 11000) throw new AppError(400, `There is already an emoji called :${name}:`);
        throw error;
      }
      realtime.toUsers(scope.audience, "emoji:changed", { scopeId: scope.id });
      ok(res, { emoji: wire(doc) });
    },
  );

  app.patch(
    "/api/emoji/:emojiId",
    authenticateToken,
    validateParams(emojiParamSchema),
    validate(renameEmojiSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const emoji = await CustomEmojiModel.findById(req.params.emojiId as string).exec();
      if (!emoji) throw new AppError(404, "Emoji not found");
      const scope = await scopeOfEmoji(me, emoji);
      if (!scope.canChange(emoji.createdBy)) throw new AppError(403, "You can't change this emoji");
      const { name } = renameEmojiSchema.parse(req.body);
      if (name !== emoji.name && (await CustomEmojiModel.exists({ ...scope.key, name }))) {
        throw new AppError(400, `There is already an emoji called :${name}:`);
      }
      emoji.name = name;
      await emoji.save();
      realtime.toUsers(scope.audience, "emoji:changed", { scopeId: scope.id });
      ok(res, { emoji: wire(emoji) });
    },
  );

  app.delete(
    "/api/emoji/:emojiId",
    authenticateToken,
    validateParams(emojiParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const emoji = await CustomEmojiModel.findById(req.params.emojiId as string).exec();
      if (!emoji) throw new AppError(404, "Emoji not found");
      const scope = await scopeOfEmoji(me, emoji);
      if (!scope.canChange(emoji.createdBy)) throw new AppError(403, "You can't remove this emoji");
      await emoji.deleteOne();
      await deleteFromGCS(emoji.storagePath).catch(() => undefined);
      realtime.toUsers(scope.audience, "emoji:changed", { scopeId: scope.id });
      ok(res, {});
    },
  );
};
