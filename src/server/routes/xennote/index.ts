import { authenticateToken } from "../../middleware/auth";
import { registerNotebookRoutes } from "./notebooks";
import { registerNoteRoutes } from "./notes";
import { registerNoteSharingRoutes } from "./noteSharing";
import { registerNoteImageRoutes } from "./images";
import { registerPageExportRoutes } from "./pageExport";
import { registerPageGraphRoutes } from "./pageGraph";
import { registerPageHistoryRoutes } from "./pageHistory";
import { registerPageTemplateRoutes } from "./pageTemplates";
import { registerPageFileRoutes } from "./pageFiles";
import { registerPageLinkRoutes } from "./pageLinks";
import { registerPageSearchRoutes } from "./pageSearch";
import { registerPageRoutes } from "./pages";
import { registerPageSharingRoutes } from "./pageSharing";
import { registerPageTrashRoutes } from "./pageTrash";
import { registerSectionRoutes } from "./sections";
import { registerPublicNoteRoutes } from "./public";
import { registerSharedItemsRoutes } from "./sharedItems";
import { registerLegacyNoteRoutes } from "./legacy";
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
  registerLegacyNoteRoutes(app);
  registerSharedItemsRoutes(app);
  registerNotebookRoutes(app);
  // Notebook sections and pages (the notebook tree, then pages, their people, files and trash).
  registerSectionRoutes(app);
  registerPageTrashRoutes(app);
  // Literal paths (/pages/peek, /pages/suggest, /search) before the /pages/:id routes.
  registerPageLinkRoutes(app);
  registerPageSearchRoutes(app);
  registerPageGraphRoutes(app);
  registerPageRoutes(app);
  registerPageHistoryRoutes(app);
  registerPageExportRoutes(app);
  registerPageTemplateRoutes(app);
  registerPageSharingRoutes(app);
  registerPageFileRoutes(app);
  // Before the note routes: a literal path must come before a :param one.
  registerNoteTrashRoutes(app);
  registerNoteRoutes(app);
  registerNoteSharingRoutes(app);
  registerNoteVersionRoutes(app);
  registerNoteImageRoutes(app);
};
