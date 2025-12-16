/**
 * Google Cloud Storage Configuration
 * Initializes and exports the GCS Storage client
 */

import { Storage } from "@google-cloud/storage";

// Initialize Storage client
// GOOGLE_APPLICATION_CREDENTIALS environment variable is automatically used
const storage = new Storage();

// Get bucket names from environment
const publicBucketName = process.env.GCS_PUBLIC_BUCKET_NAME;
const privateBucketName = process.env.GCS_PRIVATE_BUCKET_NAME;

if (!publicBucketName) {
  throw new Error("GCS_PUBLIC_BUCKET_NAME environment variable is not set");
}

if (!privateBucketName) {
  throw new Error("GCS_PRIVATE_BUCKET_NAME environment variable is not set");
}

// Get bucket instances
export const publicBucket = storage.bucket(publicBucketName);
export const privateBucket = storage.bucket(privateBucketName);