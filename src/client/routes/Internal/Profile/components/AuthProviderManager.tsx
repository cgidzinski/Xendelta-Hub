import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from "@mui/material";
import { Link as LinkIcon, LinkOff as UnlinkIcon } from "@mui/icons-material";
import { useAuthProviders } from "../../../../hooks/auth/useAuthProviders";
import AuthButton, { PROVIDER_CONFIG } from "./AuthButton";

export default function AuthProviderManager() {
  const { authProviders, loading, error, linkGoogleAccount, linkGitHubAccount, unlinkProvider, addPassword } =
    useAuthProviders();

  const [unlinkDialog, setUnlinkDialog] = useState<{
    open: boolean;
    provider: string;
  }>({ open: false, provider: "" });

  const [passwordDialog, setPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const getProviderIcon = (provider: string) => {
    const config = PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];
    return config ? React.createElement(config.icon) : <LinkIcon />;
  };

  const getProviderName = (provider: string) => {
    const config = PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];
    return config ? config.name : provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const handleUnlinkProvider = async () => {
    setActionLoading(true);
    const result = await unlinkProvider(unlinkDialog.provider);

    if (result.success) {
      setUnlinkDialog({ open: false, provider: "" });
    }
    setActionLoading(false);
  };

  const handleAddPassword = async () => {
    if (!password) {
      setPasswordError("Password is required");
      return;
    }

    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    setActionLoading(true);
    setPasswordError("");

    const result = await addPassword(password);

    if (result.success) {
      setPasswordDialog(false);
      setPassword("");
    } else {
      setPasswordError(result.message);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!authProviders) {
    return null;
  }

  const { providers, canUnlinkLocal } = authProviders;

  // Check which providers are already linked
  const linkedProviders = new Set(providers.map((p) => p.provider));
  const hasProvider = (provider: string) => linkedProviders.has(provider);

  return (
    <Box sx={{}}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Linked Accounts
          </Typography>

          <List>
            {providers.map((provider) => (
              <React.Fragment key={provider.provider}>
                <ListItem>
                  <Box sx={{ display: "flex", alignItems: "center", mr: 2 }}>{getProviderIcon(provider.provider)}</Box>

                  <ListItemText
                    primary={<Typography variant="body1">{getProviderName(provider.provider)}</Typography>}
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        {provider.email} • Linked {new Date(provider.linkedAt).toLocaleDateString()}
                      </Typography>
                    }
                  />

                  <ListItemSecondaryAction>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {providers.length > 1 && (
                        <IconButton
                          onClick={() => setUnlinkDialog({ open: true, provider: provider.provider })}
                          disabled={actionLoading}
                          color="error"
                          title="Unlink account"
                        >
                          <UnlinkIcon />
                        </IconButton>
                      )}
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>

                {provider.provider !== providers[providers.length - 1].provider && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add Authentication Method
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {!hasProvider("google") && (
            <AuthButton provider="google" onClick={linkGoogleAccount} disabled={actionLoading} />
          )}

          {!hasProvider("github") && (
            <AuthButton provider="github" onClick={linkGitHubAccount} disabled={actionLoading} />
          )}

          {!hasProvider("local") && (
            <AuthButton
              provider="local"
              onClick={() => setPasswordDialog(true)}
              disabled={actionLoading}
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      {/* Unlink Confirmation Dialog */}
      <Dialog open={unlinkDialog.open} onClose={() => setUnlinkDialog({ open: false, provider: "" })}>
        <DialogTitle>Unlink Account</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to unlink your {getProviderName(unlinkDialog.provider)} account? You'll need to use
            another authentication method to sign in.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkDialog({ open: false, provider: "" })}>Cancel</Button>
          <Button onClick={handleUnlinkProvider} color="error" disabled={actionLoading}>
            {actionLoading ? <CircularProgress size={20} /> : "Unlink"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Password Dialog */}
      <Dialog open={passwordDialog} onClose={() => setPasswordDialog(false)}>
        <DialogTitle>Add Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add a password to your account so you can sign in with your email and password.
          </Typography>

          <TextField
            fullWidth
            type="password"
            label="New Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError("");
            }}
            error={!!passwordError}
            helperText={passwordError || "Password must be at least 6 characters"}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialog(false)}>Cancel</Button>
          <Button onClick={handleAddPassword} variant="contained" disabled={actionLoading || !password}>
            {actionLoading ? <CircularProgress size={20} /> : "Add Password"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
