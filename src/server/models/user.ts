import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import bcrypt from "bcryptjs";

// User-specific conversation metadata (references Conversation collection)
const userConversationMetadataSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  unread: { type: Boolean, default: true }, // true if user has unread messages in this conversation
  lastReadAt: { type: Date }, // timestamp of last read
});

// AUTHENTICATION PROVIDER SCHEMA
const authProviderSchema = new Schema({
  provider: { type: String, required: true }, // 'local', 'google', 'facebook', etc.
  providerId: { type: String }, // Google ID, Facebook ID, etc.
  email: { type: String }, // Email from this provider
  linkedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

// INVENTORY ITEM SCHEMA
const inventoryItemSchema = new Schema({
  itemKey: { type: String, required: true },
  name: { type: String },
  description: { type: String },
  image: { type: String },
  redeemable: { type: Boolean },
  purchasedAt: { type: Date, default: Date.now },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
});

//USER
const userSchema = new Schema({
  name: { type: String },
  username: { type: String },
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true, index: true },
  avatar: { type: String, default: "/avatars/default-avatar.png" }, // Direct GCS public URL or local default
  roles: [{ type: String }],
  password: { type: String }, // For local authentication
  // Premium currency, bought in the shop (docs/monetization.md). New accounts start with none.
  gems: { type: Number, default: 0 },
  authProviders: [authProviderSchema], // Multiple authentication methods
  conversations: [userConversationMetadataSchema], // References to conversations with user-specific metadata
  resetPassword: {
    token: { type: String },
    expires: { type: Date },
  },
  xendrive: {
    // Extra bytes on top of the free tier (FREE_STORAGE_BYTES): admin grants and redeemed vouchers.
    spaceAllowed: { type: Number, default: 0 },
  },
  xenlink: [{ type: Schema.Types.ObjectId, ref: "XenLink" }],
  pinnedApps: [{ type: String }],
  // Preferred IANA timezone. Empty/absent means "follow my browser" — the default, and
  // a thing only the client can resolve, so the effective zone is sent with each request
  // that buckets by time rather than inferred here.
  timezone: { type: String },
  // "light" | "dark" | "system". Absent means "never chosen" and defaults to dark on the
  // client; "system" is an explicit choice to follow the OS, which only the browser can
  // resolve, so it is not itself a color.
  theme: { type: String, enum: ["light", "dark", "system"] },
  // Interac e-transfer destination, shown to fellow XenSplit group members when they
  // settle up with this user. `currency` is what the handle accepts money in.
  etransfer: {
    handle: { type: String }, // email address or phone number
    currency: { type: String },
  },
  inventory: [inventoryItemSchema],
  // What the person wears, per slot, as item keys (shared/cosmetics.ts). Sent with their public info.
  cosmetics: {
    badge: { type: String },
  },
  notificationsLastCheckedAt: { type: Date },
  notificationPrefs: {
    // Opt-out: on by default, users turn it off in Profile settings. Push has no
    // equivalent flag — it is governed by whether the user has any subscribed devices
    // (see models/pushSubscription.js), since a browser can't be silently subscribed.
    email: { type: Boolean, default: true },
  },
});
export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserConversationMetadata = UserAttrs["conversations"][number];
type AuthProviderEntry = UserAttrs["authProviders"][number];
export type UserDocument = HydratedDocument<UserAttrs, UserMethods>;

/** Instance methods, attached below with userSchema.method(). */
export interface UserMethods {
  generateHash(password: string): string;
  validPassword(password: string): boolean;
  addAuthProvider(
    provider: string,
    providerId: string | null | undefined,
    email: string | null | undefined,
  ): Promise<UserDocument>;
  removeAuthProvider(provider: string): Promise<UserDocument>;
  hasAuthProvider(provider: string): boolean;
  getActiveProviders(): AuthProviderEntry[];
}

userSchema.method("generateHash", function (this: UserDocument, password: string) {
  // Cost 12 for new hashes; existing cost-8 hashes from the old library still verify.
  return bcrypt.hashSync(password, 12);
});
userSchema.method("validPassword", function (this: UserDocument, password: string) {
  return bcrypt.compareSync(password, this.password as string);
});

// Helper methods for authentication providers
userSchema.method(
  "addAuthProvider",
  function (
    this: UserDocument,
    provider: string,
    providerId: string | null | undefined,
    email: string | null | undefined,
  ) {
    // Check if provider already exists
    const existingProvider = this.authProviders.find((p) => p.provider === provider);
    if (existingProvider) {
      existingProvider.providerId = providerId;
      existingProvider.email = email;
      existingProvider.isActive = true;
      existingProvider.linkedAt = new Date();
    } else {
      this.authProviders.push({
        provider: provider,
        providerId: providerId,
        email: email,
        linkedAt: new Date(),
        isActive: true,
      });
    }
    return this.save();
  },
);

userSchema.method("removeAuthProvider", function (this: UserDocument, provider: string) {
  const providerIndex = this.authProviders.findIndex((p) => p.provider === provider);
  if (providerIndex !== -1) {
    this.authProviders[providerIndex].isActive = false;
    return this.save();
  }
  return Promise.resolve(this);
});

userSchema.method("hasAuthProvider", function (this: UserDocument, provider: string) {
  return this.authProviders.some((p) => p.provider === provider && p.isActive);
});

userSchema.method("getActiveProviders", function (this: UserDocument) {
  return this.authProviders.filter((p) => p.isActive);
});

// The inferred model type does not know about the methods attached above, so state it once here.
const User = mongoose.model("User", userSchema) as unknown as Model<UserAttrs, object, UserMethods>;
//
export { User };
