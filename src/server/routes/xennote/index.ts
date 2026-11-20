import { authenticateToken } from "../../middleware/auth";
import { registerNotebookRoutes } from "./notebooks";
import { registerNoteRoutes } from "./notes";
import { registerNoteSharingRoutes } from "./noteSharing";
import { registerNoteImageRoutes } from "./images";
import { registerPublicNoteRoutes } from "./public";
import { registerSharedLinkRoutes } from "./resolve";
import { registerNoteTrashRoutes } from "./trash";
import { registerNoteVersionRoutes } from "./versions";

module.exports = function (app: any) {
  // Public links first: they are read-only views and need no sign-in.
  registerPublicNoteRoutes(app);

  // Auth for every other XenNote route
  app.use("/api/xennote", authenticateToken);
  // Before the note routes: literal paths first.
  registerSharedLinkRoutes(app);
  registerNotebookRoutes(app);
  // Before the note routes: a literal path must come before a :param one.
  registerNoteTrashRoutes(app);
  registerNoteRoutes(app);
  registerNoteSharingRoutes(app);
  registerNoteVersionRoutes(app);
  registerNoteImageRoutes(app);
};
