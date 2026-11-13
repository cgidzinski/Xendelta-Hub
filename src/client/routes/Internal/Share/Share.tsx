import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import InsertLinkOutlinedIcon from "@mui/icons-material/InsertLinkOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import ShareIcon from "@mui/icons-material/Share";
import LinkIcon from "@mui/icons-material/Link";
import { useSnackbar } from "notistack";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import UploadProgress from "../../../components/ui/UploadProgress";
import { api } from "../../../config/api";
import { useTitle } from "../../../hooks/useTitle";
import { useXenNoteActions } from "../../../hooks/xennote/useXenNote";
import { uploadOne } from "../../../hooks/xendrive/useXendrive";
import { xendriveKeys } from "../../../hooks/xendrive/keys";
import { xenLinkKeys } from "../../../hooks/xenlink/useXenlink";
import { clearShare, peekShare } from "../../../pwa/shareStash";
import { describeShare, interpretShare } from "./shareContent";

interface Option {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  run: () => Promise<string>;
}

/**
 * Where something shared from another app (the manifest's share_target) goes. The service worker keeps what was shared
 * (links, text, photos); this page reads it back and offers the places it can be saved: a note, a short link, XenDrive.
 */
export default function Share() {
  useTitle("Save shared item");
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { createNote, addImages } = useXenNoteActions();
  const [params] = useSearchParams();

  // What was shared: the form kept by the service worker, or (when a share arrives as a plain address) the query string.
  const [files, setFiles] = useState<File[]>([]);
  const [stashed, setStashed] = useState<{ title: string; text: string; url: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    peekShare()
      .then((s) => {
        if (cancelled || !s) return;
        setStashed({ title: s.title, text: s.text, url: s.url });
        setFiles(s.files);
      })
      .catch(() => undefined) // no storage: nothing was kept
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const shared = useMemo(
    () =>
      interpretShare({
        title: stashed?.title ?? params.get("title") ?? "",
        text: stashed?.text ?? params.get("text") ?? "",
        url: stashed?.url ?? params.get("url") ?? "",
      }),
    [stashed, params],
  );
  const what = describeShare(shared, files);
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);

  const finish = async (message: string, to: string) => {
    await clearShare().catch(() => undefined);
    enqueueSnackbar(message, { variant: "success" });
    navigate(to, { replace: true });
  };

  // The words that go in a note: the title, then whatever text came with it.
  const noteBody = [shared.title && !shared.url ? shared.title : "", shared.text].filter(Boolean).join("\n\n");

  const options: Option[] = [];
  if (what.hasUrl && shared.url) {
    options.push({
      key: "link-note",
      icon: <InsertLinkOutlinedIcon />,
      title: "Save as a link note",
      description: "A note in XenNote that opens the page.",
      run: async () => {
        await createNote.mutateAsync({
          type: "link",
          title: shared.title,
          link: { url: shared.url!, title: shared.title, description: shared.text },
        });
        return "/internal/xennote";
      },
    });
    options.push({
      key: "short-link",
      icon: <LinkIcon />,
      title: "Make a short link",
      description: "A short XenLink you can send to people.",
      run: async () => {
        await api.post("/api/xenlink", { name: shared.title || shared.url, url: shared.url });
        queryClient.invalidateQueries({ queryKey: xenLinkKeys.all });
        return "/internal/xenlink";
      },
    });
  }
  if (what.hasText && noteBody) {
    options.push({
      key: "text-note",
      icon: <NotesIcon />,
      title: "Save as a note",
      description: "A text note in XenNote.",
      run: async () => {
        await createNote.mutateAsync({ type: "text", title: shared.url ? shared.title : "", body: noteBody });
        return "/internal/xennote";
      },
    });
  }
  if (what.hasImages) {
    options.push({
      key: "photo-note",
      icon: <PhotoLibraryOutlinedIcon />,
      title: imageFiles.length === 1 ? "Save as a photo note" : `Save ${imageFiles.length} photos as a note`,
      description: "A note in XenNote with the photos, and any words that came with them.",
      run: async () => {
        const note = await createNote.mutateAsync({ type: "text", title: shared.title, body: shared.text });
        await addImages.mutateAsync({ id: note._id, files: imageFiles });
        return "/internal/xennote";
      },
    });
  }
  if (what.hasFiles) {
    options.push({
      key: "drive",
      icon: <CloudUploadOutlinedIcon />,
      title: files.length === 1 ? "Save to XenDrive" : `Save ${files.length} files to XenDrive`,
      description: "Into the top level of your drive.",
      run: async () => {
        for (let i = 0; i < files.length; i++) {
          await uploadOne({
            file: files[i],
            folderId: null,
            onProgress: (p) => setPercent(((i + p / 100) / files.length) * 100),
          });
        }
        queryClient.invalidateQueries({ queryKey: xendriveKeys.all });
        return "/internal/xendrive";
      },
    });
  }

  const choose = async (option: Option) => {
    setBusy(true);
    setPercent(option.key === "drive" ? 0 : null);
    try {
      const to = await option.run();
      await finish("Saved", to);
    } catch (e) {
      // Stay here with what was shared still kept, so another try (or another place) is one tap.
      enqueueSnackbar((e as Error).message || "Couldn't save that", { variant: "error" });
      setBusy(false);
      setPercent(null);
    }
  };

  const dismiss = async () => {
    await clearShare().catch(() => undefined);
    navigate("/internal", { replace: true });
  };

  return (
    <PageContainer width="narrow">
      <PageHeader title="Save shared item" />
      {!loaded ? null : options.length === 0 ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="info" icon={<ShareIcon />} sx={{ width: "100%" }}>
            Nothing to save. Share a link, some text or a photo to Xendelta Hub from another app to put it here.
          </Alert>
          <Button onClick={dismiss}>Go home</Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Card variant="outlined" sx={{ p: 2 }}>
            {shared.title && <Typography sx={{ fontWeight: 600, wordBreak: "break-word" }}>{shared.title}</Typography>}
            {shared.url && (
              <Typography variant="body2" color="primary" sx={{ wordBreak: "break-all" }}>
                {shared.url}
              </Typography>
            )}
            {shared.text && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.5 }}
              >
                {shared.text}
              </Typography>
            )}
            {files.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {files.length} {files.length === 1 ? "file" : "files"}: {files.map((f) => f.name).join(", ")}
              </Typography>
            )}
          </Card>

          <Typography variant="overline" color="text.secondary">
            Save it as
          </Typography>
          <Stack spacing={1}>
            {options.map((o) => (
              <Card key={o.key} variant="outlined">
                <CardActionArea
                  disabled={busy}
                  onClick={() => choose(o)}
                  sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-start" }}
                >
                  <Box sx={{ color: "primary.main", display: "flex" }}>{o.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{o.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {o.description}
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
          <UploadProgress percent={percent} label="files" />
          <Button onClick={dismiss} disabled={busy} sx={{ alignSelf: "flex-start" }}>
            Cancel
          </Button>
        </Stack>
      )}
    </PageContainer>
  );
}
