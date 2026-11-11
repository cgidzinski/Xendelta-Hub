import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const Recipaint = lazyPage(() => import("./Recipaint"));
const Paints = lazyPage(() => import("./Paints"));
const RecipeDetail = lazyPage(() => import("./RecipeDetail"));
const PaintAlong = lazyPage(() => import("./PaintAlong"));

// Recipaint: routes mounted under /internal by main.tsx.
export const recipaintRoutes = (
  <>
    <Route path="recipaint" element={<Recipaint />} />
    <Route path="recipaint/paints" element={<Paints />} />
    <Route path="recipaint/:id" element={<RecipeDetail />} />
    <Route path="recipaint/:id/paint" element={<PaintAlong />} />
  </>
);
