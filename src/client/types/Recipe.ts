import { UserInfo } from "./UserInfo";
import { RecipeStep } from "./RecipeStep";

/**
 * Recipe interface (as returned from API)
 */
export interface Recipe {
  _id: string;
  showcase: string[]; // Array of public GCS URLs
  title: string;
  description: string;
  dateCreated: string; // ISO string
  dateUpdated: string; // ISO string
  steps: RecipeStep[]; // Array of RecipeStep objects
  isPublic: boolean;
  author: UserInfo | null;
  owner: UserInfo | null;
  originalRecipeId: string | null;
}
