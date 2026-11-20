import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { XenNoteSharing } from "../../../../types/XenNote";

// The dialog is opened before its sharing data arrives, so it has to render without it.
let sharing: { data: XenNoteSharing | undefined; isLoading: boolean };

vi.mock("../../../../hooks/xennote/useXenNote", () => {
  const mutation = () => ({ mutateAsync: async () => ({}), isPending: false });
  return {
    noteShareUrl: (t: string) => `https://example.test/n/${t}`,
    useXenNoteSharing: () => sharing,
    useXenNoteActions: () => ({
      addNoteMembers: mutation(),
      setNoteMemberRole: mutation(),
      removeNoteMember: mutation(),
      shareNote: mutation(),
    }),
  };
});
vi.mock("../../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../../../../components/ui/ConfirmProvider", () => ({ useConfirm: () => async () => true }));
vi.mock("../../../../components/UserSelect", () => ({ UserSelect: () => null }));
vi.mock("notistack", () => ({ useSnackbar: () => ({ enqueueSnackbar: () => undefined }) }));

import NoteShareDialog from "./NoteShareDialog";

const loaded: XenNoteSharing = {
  can_manage: true,
  owner: { user_id: "u1", username: "Chris", avatar: null },
  members: [{ user_id: "u2", username: "Sam", avatar: null, role: "editor" }],
  notebook: null,
  share: { enabled: false, token: null },
};

describe("NoteShareDialog", () => {
  beforeEach(() => {
    sharing = { data: undefined, isLoading: true };
  });

  it("renders while the sharing data is still loading", () => {
    expect(() => renderToStaticMarkup(<NoteShareDialog noteId="n1" onClose={() => {}} />)).not.toThrow();
  });

  it("renders once the data has arrived, as an owner and as a viewer", () => {
    sharing = { data: loaded, isLoading: false };
    expect(() => renderToStaticMarkup(<NoteShareDialog noteId="n1" onClose={() => {}} />)).not.toThrow();
    sharing = { data: { ...loaded, can_manage: false, share: null }, isLoading: false };
    expect(() => renderToStaticMarkup(<NoteShareDialog noteId="n1" onClose={() => {}} />)).not.toThrow();
  });

  it("renders closed", () => {
    expect(() => renderToStaticMarkup(<NoteShareDialog noteId={null} onClose={() => {}} />)).not.toThrow();
  });
});
