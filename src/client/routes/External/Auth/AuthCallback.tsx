import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Container, Typography, CircularProgress, Alert } from '@mui/material';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAuth } = useAuth();
  const token = searchParams.get('token');
  const error = searchParams.get('error');

  useEffect(() => {
    const handleCallback = async () => {
      if (error) {
        // Handle OAuth error
        console.error('OAuth error:', error);
        navigate('/login?error=oauth_failed');
        return;
      }

      if (token) {
        // Store the token and verify authentication
        localStorage.setItem('token', token);
        await checkAuth();
        navigate('/internal');
      } else {
        // No token received, redirect to login
        navigate('/login?error=no_token');
      }
    };

    handleCallback();
  }, [token, error, navigate, checkAuth]);

  if (error) {
    return (
      <Container component="main" maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Authentication failed. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
      <CircularProgress size={60} sx={{ mb: 2 }} />
      <Typography variant="h6" component="h1">
        Completing authentication...
      </Typography>
    </Container>
  );
}
