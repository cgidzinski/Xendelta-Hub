import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Fab,
  IconButton,
  InputAdornment,
  LinearProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import SearchIcon from "@mui/icons-material/Search";
import { useSnackbar } from "notistack";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import {
  downloadFile,
  fileShareUrl,
  useXendriveActions,
  useXendriveBrowse,
  useXendriveRecent,
} from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import type { XenDriveFile, XenDriveFolder } from "../../../types/XenDriveFile";
import {
  applyFilters,
  filtersActive,
  LINK_FILTERS,
  TYPE_FILTERS,
  type LinkFilter,
  type TypeFilter,
} from "./lib/driveFilters";
import DriveBreadcrumbs from "./components/DriveBreadcrumbs";
import { useDrive } from "./components/DriveContext";
import DriveGrid from "./components/DriveGrid";
import DriveTable, { type DriveListHandlers } from "./components/DriveTable";
import { FilterSelect, SelectionBar, ViewToggle, type DriveViewMode } from "./components/DriveControls";
import DeleteFolderDialog from "./components/DeleteFolderDialog";
import FileShareDialog from "./components/FileShareDialog";
import FolderDialog from "./components/FolderDialog";
import FolderShareDialog from "./components/FolderShareDialog";
import ItemActions, { type ActionTarget } from "./components/ItemActions";
import NewMenu from "./components/NewMenu";
import { XENDRIVE_ROOT, filePath, folderPath } from "./paths";

const isViewMode = (v: unknown): v is DriveViewMode => v === "list" || v === "grid";

const VIEW_TITLE = { shared: "Shared links", recent: "Recent" } as const;

/** The hidden source filter: what the list shows besides the files the person uploaded to XenDrive themselves. */
const SOURCE_DRIVE = "drive";
const SOURCE_OTHERS = "others";

export default function XenDrive({ view }: { view?: "shared" | "recent" }) {
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId?: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { profile } = useUserProfile();
  const drive = useDrive();
  const actions = useXendriveActions();

  const [mode, setMode] = useLocalStorageState<DriveViewMode>("xendrive_view", "list", isViewMode);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search).trim();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  // Files apps stored for the person (photos, chat attachments) are left out of the drive unless they ask for them here.
  const [source, setSource] = useState<string>(SOURCE_DRIVE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<{ target: ActionTarget; anchor: HTMLElement } | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renaming, setRenaming] = useState<ActionTarget | null>(null);
  const [sharingFolderId, setSharingFolderId] = useState<string | null>(null);
  const [sharingFileId, setSharingFileId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<XenDriveFolder | null>(null);

  const { data: recent } = useXendriveRecent();
  // Only people who have app files ever see the control
  const hasAppFiles = !!recent?.appFiles?.count;
  const sourceActive = source !== SOURCE_DRIVE;
  const { data, isLoading, isError, error, refetch } = useXendriveBrowse(folderId ?? null, q || undefined, {
    view,
    thumbs: mode === "grid",
    source: sourceActive ? source : undefined,
  });

  useTitle(view ? `XenDrive - ${VIEW_TITLE[view]}` : data?.folder ? `XenDrive - ${data.folder.name}` : "XenDrive");

  const { setTarget, newFolderTick } = drive;
  // Tell the shell where dropped and picked files should go
  useEffect(() => {
    setTarget({ folderId: view ? null : (folderId ?? null), name: data?.folder?.name ?? "My Drive" });
  }, [folderId, view, data?.folder?.name, setTarget]);

  // The sidebar's New menu asks for the dialog
  useEffect(() => {
    if (newFolderTick > 0) setNewFolderOpen(true);
  }, [newFolderTick]);

  // A new place starts with nothing selected and no filters
  useEffect(() => {
    setSelected(new Set());
    setTypeFilter("all");
    setLinkFilter("all");
  }, [folderId, view, q]);

  const filters = useMemo(() => ({ type: typeFilter, link: linkFilter }), [typeFilter, linkFilter]);
  const files = useMemo(() => applyFilters(data?.files ?? [], filters), [data?.files, filters]);
  const filtered = filtersActive(filters);
  // A folder has no type or link status, so folders step aside while a filter is on
  const folders = useMemo(() => (filtered ? [] : (data?.folders ?? [])), [filtered, data?.folders]);
  const sharingFolder = data?.folders.find((f) => f._id === sharingFolderId) ?? null;
  const sharingFile = data?.files.find((f) => f._id === sharingFileId) ?? null;

  const fail = (e: unknown, fallback: string) =>
    enqueueSnackbar((e as Error)?.message || fallback, { variant: "error" });

  // ---- single-item actions
  const { mutateAsync: updateSettings } = actions.updateFileSettings;
  const ensureLink = useCallback(
    async (file: XenDriveFile): Promise<string | null> => {
      if (!file.shareToken) return null;
      if (!file.shared) await updateSettings({ fileId: file._id, settings: { shareEnabled: true } });
      return fileShareUrl(file.shareToken);
    },
    [updateSettings],
  );

  const copyLink = async (file: XenDriveFile) => {
    try {
      const url = await ensureLink(file);
      if (!url) return;
      await navigator.clipboard.writeText(url);
      enqueueSnackbar(file.shared ? "Link copied" : "Link turned on and copied", { variant: "success" });
    } catch (e) {
      fail(e, "Couldn't copy the link");
    }
  };

  const download = async (file: XenDriveFile) => {
    try {
      await downloadFile(file._id);
    } catch (e) {
      fail(e, "Couldn't download the file");
    }
  };

  const removeFile = async (file: XenDriveFile) => {
    const ok = await confirm({
      title: "Delete this file?",
      message: `"${file.name}" will be deleted for good${file.shared ? ", and its link stops working" : ""}.`,
      confirmLabel: "Delete file",
    });
    if (!ok) return;
    actions.deleteFile.mutate(file._id, {
      onSuccess: () => enqueueSnackbar("File deleted", { variant: "success" }),
      onError: (e: Error) => fail(e, "Couldn't delete the file"),
    });
  };

  const menuHandlers = {
    onOpen: (t: ActionTarget) => navigate(t.kind === "folder" ? folderPath(t.folder._id) : filePath(t.file._id)),
    onCopyLink: copyLink,
    onShare: (t: ActionTarget) =>
      t.kind === "folder" ? setSharingFolderId(t.folder._id) : setSharingFileId(t.file._id),
    onDownload: download,
    onRename: setRenaming,
    onDelete: (t: ActionTarget) => (t.kind === "folder" ? setDeletingFolder(t.folder) : removeFile(t.file)),
  };

  // ---- selection and bulk actions
  const everyId = useMemo(() => [...folders.map((f) => f._id), ...files.map((f) => f._id)], [folders, files]);
  const selectedFiles = files.filter((f) => selected.has(f._id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected((prev) => (prev.size === everyId.length ? new Set() : new Set(everyId)));

  const bulkDelete = async () => {
    // Files that don't use your storage belong to the app that stored them: they stay.
    const deletable = selectedFiles.filter((f) => f.counted !== false);
    const chosenFolders = folders.filter((f) => selected.has(f._id));
    const parts = [
      deletable.length ? `${deletable.length} ${deletable.length === 1 ? "file" : "files"}` : "",
      chosenFolders.length
        ? `${chosenFolders.length} ${chosenFolders.length === 1 ? "folder" : "folders"} and everything inside`
        : "",
    ].filter(Boolean);
    if (!deletable.length && !chosenFolders.length) {
      enqueueSnackbar("Those files belong to another app, so they can't be deleted here", { variant: "info" });
      return;
    }
    const ok = await confirm({
      title: `Delete ${deletable.length + chosenFolders.length} ${deletable.length + chosenFolders.length === 1 ? "item" : "items"}?`,
      message: `${parts.join(" and ")} will be deleted for good.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      for (const f of deletable) await actions.deleteFile.mutateAsync(f._id);
      for (const f of chosenFolders) await actions.deleteFolder.mutateAsync(f._id);
      setSelected(new Set());
      enqueueSnackbar("Deleted", { variant: "success" });
    } catch (e) {
      fail(e, "Couldn't delete everything");
    }
  };

  const bulkDownload = async () => {
    for (const f of selectedFiles) {
      await download(f);
      await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads that start all at once
    }
  };

  const bulkCopyLinks = async () => {
    try {
      const urls: string[] = [];
      // a file an app stored can't have a public link
      for (const f of selectedFiles.filter((f) => !f.source)) {
        const url = await ensureLink(f);
        if (url) urls.push(url);
      }
      await navigator.clipboard.writeText(urls.join("\n"));
      enqueueSnackbar(`${urls.length} ${urls.length === 1 ? "link" : "links"} copied`, { variant: "success" });
    } catch (e) {
      fail(e, "Couldn't copy the links");
    }
  };

  const handlers: DriveListHandlers = {
    onOpenFolder: (f) => navigate(folderPath(f._id)),
    onOpenFile: (f) => navigate(filePath(f._id)),
    onMenu: (target, anchor) => setMenu({ target, anchor }),
    selected,
    onToggle: toggle,
    onToggleAll: toggleAll,
    onDropFiles: (id, dropped) => drive.add(dropped, id),
  };

  // ---- layout
  const usage = profile?.xendrive;
  const percent = usage && usage.spaceAllowed > 0 ? Math.min(100, (usage.spaceUsed / usage.spaceAllowed) * 100) : 0;
  const searching = !!q;
  const crumbs = data?.breadcrumb ?? [];
  const parentId = crumbs.length > 1 ? crumbs[crumbs.length - 2]._id : null;
  const goUp = () => navigate(parentId ? folderPath(parentId) : XENDRIVE_ROOT);
  const empty = !!data && folders.length === 0 && files.length === 0;
  const total = (data?.folders.length ?? 0) + (data?.files.length ?? 0);
  const heading = view ? VIEW_TITLE[view] : (data?.folder?.name ?? "My Drive");

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 3 }, pb: 12, maxWidth: 1400 }}>
      {/* heading row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        {!view && folderId && (
          <IconButton aria-label="Up one level" onClick={goUp} edge="start" sx={{ display: { md: "none" } }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {view || searching ? (
            <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
              {searching ? "Search results" : heading}
            </Typography>
          ) : (
            <>
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <DriveBreadcrumbs crumbs={crumbs} folderTo={folderPath} rootTo={XENDRIVE_ROOT} />
              </Box>
              <Box sx={{ display: { md: "none" } }}>
                {crumbs.length > 1 && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    My Drive ›{" "}
                    {crumbs
                      .slice(0, -1)
                      .map((c) => c.name)
                      .join(" › ")}
                  </Typography>
                )}
                <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }} noWrap>
                  {heading}
                </Typography>
              </Box>
            </>
          )}
        </Box>
        <ViewToggle value={mode} onChange={setMode} />
        {!view && (
          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1 }}>
            {data?.folder && (
              <Button
                variant="outlined"
                startIcon={<IosShareIcon />}
                onClick={() => data.folder && setSharingFolderId(data.folder._id)}
              >
                Share
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<CreateNewFolderOutlinedIcon />}
              onClick={() => setNewFolderOpen(true)}
            >
              New folder
            </Button>
            <Button
              variant="contained"
              startIcon={<FileUploadOutlinedIcon />}
              onClick={() => drive.pickFiles(folderId ?? null)}
            >
              Upload
            </Button>
          </Box>
        )}
      </Box>

      {/* storage, on a phone (the sidebar shows it on a computer) */}
      {usage && (
        <Box sx={{ display: { md: "none" }, mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={percent}
              color={percent > 90 ? "error" : percent > 75 ? "warning" : "primary"}
              sx={{ flex: 1, height: 5, borderRadius: 3 }}
            />
            <Typography variant="caption" color="text.secondary">
              {formatFileSize(usage.spaceUsed)} of {formatFileSize(usage.spaceAllowed)}
            </Typography>
          </Box>
        </Box>
      )}

      {/* search and filters: the search takes a row to itself on a phone, then the two filters share the next one */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <TextField
          placeholder="Search everything in My Drive"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ flex: { xs: "1 1 100%", md: "1 1 280px" } }}
          slotProps={{
            htmlInput: { "aria-label": "Search everything in My Drive" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          options={TYPE_FILTERS}
          onChange={setTypeFilter}
          sx={{ flex: { xs: "1 1 0", md: "0 0 150px" } }}
        />
        <FilterSelect
          label="Link"
          value={linkFilter}
          options={LINK_FILTERS}
          onChange={setLinkFilter}
          sx={{ flex: { xs: "1 1 0", md: "0 0 150px" } }}
        />
        {!view && (hasAppFiles || sourceActive) && (
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={source}
            onChange={(_, v) => v && setSource(v)}
            aria-label="Which files to show"
            sx={{ flex: { xs: "1 1 100%", md: "0 0 auto" } }}
          >
            <ToggleButton value={SOURCE_DRIVE} sx={{ flex: 1, px: 2 }}>
              XenDrive
            </ToggleButton>
            <ToggleButton value={SOURCE_OTHERS} sx={{ flex: 1, px: 2 }}>
              Others
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      {sourceActive && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2, mt: -1 }}>
          Photos and attachments that apps stored for you. Those marked “Doesn't count toward storage” belong to their
          app, so they can't be renamed or deleted here.
        </Typography>
      )}

      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          fileCount={selectedFiles.length}
          linkCount={selectedFiles.filter((f) => !f.source).length}
          onClear={() => setSelected(new Set())}
          onDownload={bulkDownload}
          onCopyLinks={bulkCopyLinks}
          onDelete={bulkDelete}
        />
      )}

      {/* the listing */}
      {isLoading && !data ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load this folder" onRetry={() => refetch()} />
      ) : empty ? (
        <EmptyState
          icon={<FolderOpenIcon />}
          title={
            filtered || searching || sourceActive
              ? "Nothing matches"
              : view === "shared"
                ? "Nothing shared yet"
                : view === "recent"
                  ? "Nothing uploaded yet"
                  : folderId
                    ? "This folder is empty"
                    : "No files yet"
          }
          description={
            filtered || searching || sourceActive
              ? "Try a different search, or clear the filters."
              : view === "shared"
                ? "Files and folders with a public link show up here."
                : "Drop files here, or use the New button."
          }
          action={
            !view && !searching && !filtered ? (
              <Button
                variant="contained"
                startIcon={<FileUploadOutlinedIcon />}
                onClick={() => drive.pickFiles(folderId ?? null)}
              >
                Upload files
              </Button>
            ) : undefined
          }
        />
      ) : mode === "grid" ? (
        <DriveGrid folders={folders} files={files} handlers={handlers} onCopyLink={copyLink} onDownload={download} />
      ) : (
        <DriveTable folders={folders} files={files} handlers={handlers} />
      )}

      {data && !empty && (
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1.5, color: "text.secondary", fontSize: 13 }}>
          <span>
            {folders.length} {folders.length === 1 ? "folder" : "folders"} · {files.length}{" "}
            {files.length === 1 ? "file" : "files"}
            {filtered ? ` of ${total}` : ""}
          </span>
          <span>{formatFileSize(files.reduce((sum, f) => sum + (f.size || 0), 0))}</span>
        </Box>
      )}

      {/* phone: add */}
      {!view && (
        <>
          <Fab
            color="primary"
            variant="extended"
            aria-label="New"
            onClick={(e) => setNewMenuAnchor(e.currentTarget)}
            sx={{ display: { md: "none" }, position: "fixed", right: 18, bottom: 22 }}
          >
            <AddIcon sx={{ mr: 1 }} />
            New
          </Fab>
          <NewMenu anchorEl={newMenuAnchor} onClose={() => setNewMenuAnchor(null)} />
        </>
      )}

      <ItemActions
        target={menu?.target ?? null}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        handlers={menuHandlers}
      />

      <FolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onSave={async (name) => {
          const { folder } = await actions.createFolder.mutateAsync({
            name,
            parentId: view ? null : (folderId ?? null),
          });
          enqueueSnackbar(`Folder “${folder.name}” created`, { variant: "success" });
        }}
      />
      <FolderDialog
        open={!!renaming}
        onClose={() => setRenaming(null)}
        kind={renaming?.kind === "file" ? "file" : "folder"}
        initialName={renaming ? (renaming.kind === "file" ? renaming.file.name : renaming.folder.name) : ""}
        onSave={async (name) => {
          if (!renaming) return;
          if (renaming.kind === "file")
            await actions.updateFileSettings.mutateAsync({ fileId: renaming.file._id, settings: { name } });
          else await actions.renameFolder.mutateAsync({ folderId: renaming.folder._id, name });
        }}
      />
      <FolderShareDialog folder={sharingFolder} onClose={() => setSharingFolderId(null)} />
      <FileShareDialog file={sharingFile} onClose={() => setSharingFileId(null)} />
      <DeleteFolderDialog
        folder={deletingFolder}
        onClose={() => setDeletingFolder(null)}
        onConfirm={async (folder) => {
          try {
            await actions.deleteFolder.mutateAsync(folder._id);
            enqueueSnackbar("Folder deleted", { variant: "success" });
          } catch (e) {
            fail(e, "Couldn't delete the folder");
          }
        }}
      />
    </Box>
  );
}
