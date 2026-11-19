import { authenticateToken } from "../../middleware/auth";
import { registerNotebookRoutes } from "./notebooks";
import { registerNoteRoutes } from "./notes";
import { registerNoteImageRoutes } from "./images";
import { registerPublicNoteRoutes } from "./public";
import { registerNoteTrashRoutes } from "./trash";

module.exports = function (app: any) {
  // Public links first: they are read-only views and need no sign-in.
  registerPublicNoteRoutes(app);

  // Auth for every other XenNote route
  app.use("/api/xennote", authenticateToken);
  registerNotebookRoutes(app);
  // Before the note routes: a literal path must come before a :param one.
  registerNoteTrashRoutes(app);
  registerNoteRoutes(app);
  registerNoteImageRoutes(app);
};
