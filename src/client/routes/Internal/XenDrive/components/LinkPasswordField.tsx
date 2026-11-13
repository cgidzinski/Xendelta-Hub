import { useState } from "react";
import { Box, Button, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SectionLabel from "../../../../components/ui/SectionLabel";

interface LinkPasswordFieldProps {
  hasPassword: boolean;
  busy: boolean;
  /** Called with the new password. */
  onSave: (password: string) => void;
  onRemove: () => void;
  /** Changing this (a different file or folder) clears what was typed. */
  resetKey: string;
}

/**
 * The password on a public link. It is stored as a hash, so it can be set, replaced or removed here but never read
 * back: the box is always empty, and says whether there is one.
 */
export default function LinkPasswordField({ hasPassword, busy, onSave, onRemove, resetKey }: LinkPasswordFieldProps) {
  const [typed, setTyped] = useState({ key: resetKey, value: "" });
  const [show, setShow] = useState(false);
  const password = typed.key === resetKey ? typed.value : "";

  return (
    <Box>
      <SectionLabel>Password</SectionLabel>
      <TextField
        fullWidth
        size="small"
        type={show ? "text" : "password"}
        value={password}
        placeholder={hasPassword ? "Enter a new password" : "Set a password"}
        helperText={hasPassword ? "There's a password now. It can't be shown, only replaced or removed." : undefined}
        onChange={(e) => setTyped({ key: resetKey, value: e.target.value })}
        slotProps={{
          htmlInput: { "aria-label": "Password", maxLength: 200, autoComplete: "new-password" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <LockOutlinedIcon fontSize="small" color={hasPassword ? "success" : "inherit"} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          disabled={busy || password === ""}
          onClick={() => {
            onSave(password);
            setTyped({ key: resetKey, value: "" });
          }}
        >
          Save password
        </Button>
        {hasPassword && (
          <Button size="small" color="error" disabled={busy} onClick={onRemove}>
            Remove password
          </Button>
        )}
        <Typography variant="body2" color="text.secondary">
          People need it to download.
        </Typography>
      </Box>
    </Box>
  );
}
