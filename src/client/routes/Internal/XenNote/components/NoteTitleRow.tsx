import { useEffect, useId, useRef } from "react";
import { Box, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";

interface NoteTitleRowProps {
  title: string;
  pinned: boolean;
  readOnly: boolean;
  focusTitle: boolean;
  doneDisabled: boolean;
  onTitle: (title: string) => void;
  onTogglePin: () => void;
  onEdit?: () => void;
  onClose: () => void;
}

export default function NoteTitleRow({
  title,
  pinned,
  readOnly,
  focusTitle,
  doneDisabled,
  onTitle,
  onTogglePin,
  onEdit,
  onClose,
}: NoteTitleRowProps) {
  const titleId = useId();
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = titleInput.current;
    if (!focusTitle || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusTitle]);

  const actionLabel = onEdit ? "Edit note" : "Done";
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: { xs: 1, sm: 2 },
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="body2" color="text.secondary" role="status" sx={{ flex: 1, pl: 1 }}>
          {readOnly ? "Preview" : "Editing"}
        </Typography>
        {!readOnly && (
          <Tooltip title={pinned ? "Unpin" : "Pin"}>
            <IconButton aria-label={pinned ? "Unpin" : "Pin"} aria-pressed={pinned} onClick={onTogglePin}>
              {pinned ? <PushPinIcon color="primary" /> : <PushPinOutlinedIcon />}
            </IconButton>
          </Tooltip>
        )}
        {(!readOnly || onEdit) && (
          <Tooltip title={actionLabel}>
            <Box component="span" sx={{ display: "inline-flex" }}>
              <IconButton
                aria-label={actionLabel}
                onClick={onEdit ?? onClose}
                disabled={doneDisabled}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 1.5,
                  color: "primary.contrastText",
                  bgcolor: "primary.main",
                  "&:hover": { bgcolor: "primary.dark" },
                  "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
                }}
              >
                {onEdit ? <EditOutlinedIcon /> : <CheckIcon />}
              </IconButton>
            </Box>
          </Tooltip>
        )}
        <Tooltip title="Close">
          <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44 }}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Typography component="label" htmlFor={titleId} variant="body2" color="text.secondary">
          Title
        </Typography>
        <InputBase
          id={titleId}
          inputRef={titleInput}
          fullWidth
          placeholder="Untitled note"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || readOnly || e.nativeEvent.isComposing) return;
            e.preventDefault();
            // Enter in the title moves to the body: the block editor, the text/caption field, or the first list item.
            const dialog = titleInput.current?.closest('[role="dialog"]');
            dialog
              ?.querySelector<HTMLElement>(
                '[role="textbox"][aria-label="Note"], textarea[aria-label="Note"], textarea[aria-label="Caption"], .MuiDialogContent-root input[type="text"]',
              )
              ?.focus();
          }}
          readOnly={readOnly}
          slotProps={{ input: { maxLength: 200 } }}
          sx={{
            mt: 0.5,
            px: 1.5,
            minHeight: 54,
            border: 1,
            borderColor: readOnly ? "transparent" : "text.secondary",
            borderRadius: 2,
            bgcolor: readOnly ? "transparent" : "background.paper",
            fontSize: { xs: 22, sm: 28 },
            fontWeight: 600,
            "&.Mui-focused": readOnly
              ? undefined
              : { borderColor: "primary.main", outline: "1px solid", outlineColor: "primary.main" },
          }}
        />
      </Box>
    </>
  );
}
