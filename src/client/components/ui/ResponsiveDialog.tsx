import { Dialog, DialogActions, DialogContent, DialogTitle, IconButton, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import type { ReactNode } from "react";
import type { DialogProps } from "@mui/material";

interface ResponsiveDialogProps extends Omit<DialogProps, "title" | "fullScreen"> {
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

/** Dialog that goes full screen on phones, with the standard title row and actions row. */
export default function ResponsiveDialog({
  title,
  onClose,
  actions,
  children,
  maxWidth = "sm",
  ...rest
}: ResponsiveDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <Dialog fullWidth maxWidth={maxWidth} fullScreen={isMobile} onClose={onClose} {...rest}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        {title}
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>}
    </Dialog>
  );
}
