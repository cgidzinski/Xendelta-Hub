import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Box, CircularProgress, Typography, Container } from '@mui/material';

interface UnprotectedRouteProps {
  children: React.ReactNode;
}

const UnprotectedRoute: React.FC<UnprotectedRouteProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // For landing page, always redirect to internal
      if (location.pathname === '/') {
        navigate('/internal', { replace: true });
      } else {
        const from = location.state?.from?.pathname || '/internal';
        navigate(from, { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, navigate, location.state, location.pathname]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: '100vh',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            Checking authentication...
          </Typography>
        </Box>
      </Container>
    );
  }

  // If not authenticated, show the protected content
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // If authenticated, return null (will redirect)
  return null;
};

export default UnprotectedRoute;
