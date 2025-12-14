import { z } from "zod";
import mongoose from "mongoose";
import { VALIDATION_LIMITS } from "../constants";

// Helper to validate MongoDB ObjectId
const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: "Invalid ObjectId format" }
);

// User validation schemas
export const signupSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase().max(VALIDATION_LIMITS.EMAIL_MAX, "Email too long"),
  username: z.string()
    .min(VALIDATION_LIMITS.USERNAME_MIN, "Username must be at least 3 characters")
    .max(VALIDATION_LIMITS.USERNAME_MAX, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string()
    .min(VALIDATION_LIMITS.PASSWORD_MIN, "Password must be at least 8 characters")
    .max(VALIDATION_LIMITS.PASSWORD_MAX, "Password too long")
    .regex(/(?=.*[a-z])/, "Password must contain at least one lowercase letter")
    .regex(/(?=.*[A-Z])/, "Password must contain at least one uppercase letter")
    .regex(/(?=.*\d)/, "Password must contain at least one number"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(50, "Username too long"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  avatar: z.string().url("Invalid avatar URL").optional(),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .optional(),
});

// Message validation schemas
export const sendMessageSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long (max 10000 characters)"),
  parentMessageId: objectIdSchema.optional(),
});

export const createConversationSchema = z.object({
  participants: z.array(objectIdSchema)
    .min(1, "At least one participant is required")
    .max(100, "Too many participants"),
  message: z.string()
    .max(10000, "Message too long (max 10000 characters)")
    .optional(),
});

export const updateConversationNameSchema = z.object({
  name: z.string()
    .min(1, "Conversation name cannot be empty")
    .max(100, "Conversation name too long")
    .optional(),
});

export const addParticipantsSchema = z.object({
  participantIds: z.array(objectIdSchema)
    .min(1, "At least one participant is required")
    .max(100, "Too many participants"),
});

// Notification validation schemas
export const createNotificationSchema = z.object({
  title: z.string()
    .min(1, "Title cannot be empty")
    .max(200, "Title too long"),
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message too long"),
  icon: z.enum(["person", "security", "announcement", "mail", "lock"]).optional(),
});

// Admin validation schemas
export const adminBroadcastMessageSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long"),
  conversationTitle: z.string()
    .max(100, "Conversation title too long")
    .optional(),
});

// Validation middleware
export const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: false,
          message: "Validation error",
          errors: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }
      return res.status(500).json({
        status: false,
        message: "Validation failed",
      });
    }
  };
};

// Validate params (for route parameters like :conversationId)
export const validateParams = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: false,
          message: "Invalid parameter",
          errors: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }
      return res.status(500).json({
        status: false,
        message: "Parameter validation failed",
      });
    }
  };
};

// Schema for conversationId param
export const conversationIdParamSchema = z.object({
  conversationId: objectIdSchema,
});

// Schema for messageId param
export const messageIdParamSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema,
});

// Schema for participantId param
export const participantIdParamSchema = z.object({
  conversationId: objectIdSchema,
  participantId: objectIdSchema,
});

// Blog validation schemas
export const createBlogPostSchema = z.object({
  title: z.string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title too long (max 200 characters)"),
  slug: z.string()
    .min(1, "Slug is required")
    .max(200, "Slug too long")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  markdown: z.string()
    .min(10, "Content must be at least 10 characters")
    .max(100000, "Content too long"),
  publishDate: z.string().datetime("Invalid date format"),
  image: z.string().optional(),
  images: z.array(z.string()).optional(),
  featuredImage: z.string().optional(),
  categories: z.array(z.string().max(50, "Category too long")).optional(),
  tags: z.array(z.string().max(30, "Tag too long")).optional(),
  featured: z.boolean().optional(),
});

export const updateBlogPostSchema = z.object({
  title: z.string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title too long (max 200 characters)")
    .optional(),
  slug: z.string()
    .min(1, "Slug is required")
    .max(200, "Slug too long")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only")
    .optional(),
  markdown: z.string()
    .min(10, "Content must be at least 10 characters")
    .max(100000, "Content too long")
    .optional(),
  publishDate: z.string().datetime("Invalid date format").optional(),
  image: z.string().optional(),
  images: z.array(z.string()).optional(),
  featuredImage: z.string().optional(),
  categories: z.array(z.string().max(50, "Category too long")).optional(),
  tags: z.array(z.string().max(30, "Tag too long")).optional(),
  featured: z.boolean().optional(),
});

export const blogPostIdParamSchema = z.object({
  id: objectIdSchema,
});

export const blogPostSlugParamSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
});

