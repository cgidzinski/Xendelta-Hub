import { useState, useEffect } from 'react';

interface AuthProvider {
  provider: string;
  providerId: string;
  email: string;
  linkedAt: string;
  isActive: boolean;
}

interface AuthProvidersData {
  providers: AuthProvider[];
  canUnlinkLocal: boolean;
}

export const useAuthProviders = () => {
  const [authProviders, setAuthProviders] = useState<AuthProvidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuthProviders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/user/auth-providers', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setAuthProviders(data);
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to fetch authentication providers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const linkGoogleAccount = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/user/link-google', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to Google OAuth
        window.location.href = data.redirectUrl;
      } else {
        throw new Error(data.message || 'Failed to initiate Google account linking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const linkGitHubAccount = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/user/link-github', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to GitHub OAuth
        window.location.href = data.redirectUrl;
      } else {
        throw new Error(data.message || 'Failed to initiate GitHub account linking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const unlinkProvider = async (provider: string) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/user/unlink-provider', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh the auth providers list
        await fetchAuthProviders();
        return { success: true, message: data.message };
      } else {
        throw new Error(data.message || 'Failed to unlink authentication provider');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const addPassword = async (password: string) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/user/add-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh the auth providers list
        await fetchAuthProviders();
        return { success: true, message: data.message };
      } else {
        throw new Error(data.message || 'Failed to add password');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  useEffect(() => {
    fetchAuthProviders();
  }, []);

  return {
    authProviders,
    loading,
    error,
    fetchAuthProviders,
    linkGoogleAccount,
    linkGitHubAccount,
    unlinkProvider,
    addPassword,
  };
};
