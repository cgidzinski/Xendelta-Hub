import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
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
  Switch,
} from '@mui/material';
import {
  Google as GoogleIcon,
  GitHub as GitHubIcon,
  Email as EmailIcon,
  Link as LinkIcon,
  LinkOff as UnlinkIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useAuthProviders } from '../hooks/auth/useAuthProviders';

const AuthProviderManager: React.FC = () => {
  const {
    authProviders,
    loading,
    error,
    linkGoogleAccount,
    linkGitHubAccount,
    unlinkProvider,
    addPassword,
  } = useAuthProviders();

  const [unlinkDialog, setUnlinkDialog] = useState<{
    open: boolean;
    provider: string;
  }>({ open: false, provider: '' });
  
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return <GoogleIcon />;
      case 'github':
        return <GitHubIcon />;
      case 'local':
        return <EmailIcon />;
      default:
        return <LinkIcon />;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      case 'local':
        return 'Email & Password';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  };

  const handleUnlinkProvider = async () => {
    setActionLoading(true);
    const result = await unlinkProvider(unlinkDialog.provider);
    
    if (result.success) {
      setUnlinkDialog({ open: false, provider: '' });
    }
    setActionLoading(false);
  };

  const handleAddPassword = async () => {
    if (!password) {
      setPasswordError('Password is required');
      return;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setActionLoading(true);
    setPasswordError('');
    
    const result = await addPassword(password);
    
    if (result.success) {
      setPasswordDialog(false);
      setPassword('');
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
  const hasGoogle = providers.some(p => p.provider === 'google');
  const hasGitHub = providers.some(p => p.provider === 'github');
  const hasLocal = providers.some(p => p.provider === 'local');

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Authentication Methods
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage how you sign in to your account. You can link multiple authentication methods for convenience.
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Linked Accounts
          </Typography>
          
          <List>
            {providers.map((provider) => (
              <React.Fragment key={provider.provider}>
                <ListItem>
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                    {getProviderIcon(provider.provider)}
                  </Box>
                  
                  <ListItemText
                    primary={
                      <Typography variant="body1">
                        {getProviderName(provider.provider)}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        {provider.email} • Linked {new Date(provider.linkedAt).toLocaleDateString()}
                      </Typography>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                
                {provider.provider !== providers[providers.length - 1].provider && (
                  <Divider />
                )}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add Authentication Method
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!hasGoogle && (
            <Button
              variant="contained"
              startIcon={<GoogleIcon />}
              onClick={linkGoogleAccount}
              disabled={actionLoading}
              sx={{
                backgroundColor: "#ffffff",
                color: "#3c4043",
                border: "1px solid #dadce0",
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
                py: 1,
                px: 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
                '&:hover': {
                  backgroundColor: "#f8f9fa",
                  borderColor: "#dadce0",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.2)",
                },
                '&:active': {
                  backgroundColor: "#f1f3f4",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                },
                '&:disabled': {
                  backgroundColor: "#f5f5f5",
                  color: "#9aa0a6",
                  borderColor: "#e0e0e0",
                },
              }}
            >
              Link Google Account
            </Button>
          )}
          
          {!hasGitHub && (
            <Button
              variant="contained"
              startIcon={<GitHubIcon />}
              onClick={linkGitHubAccount}
              disabled={actionLoading}
              sx={{
                backgroundColor: "#24292e",
                color: "#ffffff",
                border: "1px solid #24292e",
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
                py: 1,
                px: 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
                '&:hover': {
                  backgroundColor: "#1a1e22",
                  borderColor: "#1a1e22",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.2)",
                },
                '&:active': {
                  backgroundColor: "#0d1117",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                },
                '&:disabled': {
                  backgroundColor: "#6c757d",
                  color: "#ffffff",
                  borderColor: "#6c757d",
                },
              }}
            >
              Link GitHub Account
            </Button>
          )}
          
          {!hasLocal && (
            <Button
              variant="outlined"
              startIcon={<LockIcon />}
              onClick={() => setPasswordDialog(true)}
              disabled={actionLoading}
            >
              Add Password
            </Button>
          )}
        </Box>
      </Box>

      {/* Unlink Confirmation Dialog */}
      <Dialog open={unlinkDialog.open} onClose={() => setUnlinkDialog({ open: false, provider: '' })}>
        <DialogTitle>Unlink Account</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to unlink your {getProviderName(unlinkDialog.provider)} account? 
            You'll need to use another authentication method to sign in.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkDialog({ open: false, provider: '' })}>
            Cancel
          </Button>
          <Button 
            onClick={handleUnlinkProvider} 
            color="error" 
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Unlink'}
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
              setPasswordError('');
            }}
            error={!!passwordError}
            helperText={passwordError || 'Password must be at least 6 characters'}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddPassword} 
            variant="contained"
            disabled={actionLoading || !password}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Add Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AuthProviderManager;
