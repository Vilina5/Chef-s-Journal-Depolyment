
export interface User {
  id: string;
  name: string;
  phoneNumber: string; // [新增] 用于唯一标识身份
  partnerId?: string;
  color: string;
}

export interface Ingredient {
  id: string;
  name: string;
  amount: string; // e.g. "200g", "2 pcs"
  estimatedCost: number; // Unit price or total estimated cost for this amount
  purchased: boolean;
  actualCost: number;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  image?: string; // Base64 or URL
  videoUrl?: string;
  ingredients: Ingredient[];
  steps: string[];
  seasoning: string; // Text description of ratios
  tags: string[];
  createdAt: number;
  createdBy?: string; // User ID
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD
  recipeIds: string[];
  lockedBy?: string; // User ID who locked the plan
  lockedAt?: number;
}

export interface ShoppingItem extends Ingredient {
  recipeId: string; // Trace back to which recipe needed this
  date: string; // For which planned date
}

export interface LogEntry {
  userId: string;
  notes: string;
  photo?: string;
}

export interface MealLog {
  id: string;
  date: string; // YYYY-MM-DD
  cookedRecipeIds?: string[]; // List of recipes cooked this day
  entries: LogEntry[]; // Support multiple users
}

export enum AppView {
  LOGIN = 'LOGIN',
  RECIPES = 'RECIPES',
  SHOPPING = 'SHOPPING',
  CALENDAR = 'CALENDAR',
  RECIPE_EDIT = 'RECIPE_EDIT',
  PROFILE = 'PROFILE'
}
