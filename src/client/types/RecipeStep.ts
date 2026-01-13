/**
 * Recipe step interface
 */
export interface RecipeStep {
  index: number;
  stepName: string; // Name of the step
  method: string; // Method (e.g., "Dry brush", "Wash", etc.)
  images: string[]; // Array of public GCS URLs
  text: string;
  paints: string; // e.g., "Citadel: ghostly green"
}
