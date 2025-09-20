import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Container,
  Alert,
  InputAdornment,
  CircularProgress,
  Paper,
  Divider,
} from "@mui/material";
import { Email, LockReset as ResetIcon, ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
interface ResetFormData {
  email: string;
}

interface ResetErrors {
  email?: string;
  general?: string;
}

export default function Reset() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<ResetFormData>({
    email: "",
  });
  const [errors, setErrors] = useState<ResetErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { resetPassword } = useAuth();
  const handleInputChange = (field: keyof ResetFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: ResetErrors = {};

    if (!formData.email?.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const success = await resetPassword(formData.email);

      if (success) {
        setIsSuccess(true);
      } else {
        setErrors({ general: "Failed to send reset email. Please try again later." });
      }
    } catch (error) {
      setErrors({
        general: "Failed to send reset email. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate("/login");
  };

  if (isSuccess) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <Paper
            elevation={8}
            sx={{
              padding: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              borderRadius: 2,
              background: "linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)",
              color: "white",
              marginBottom: 3,
            }}
          >
            <ResetIcon sx={{ fontSize: 48, mb: 2 }} />
            <Typography component="h1" variant="h4" fontWeight="bold">
              Check Your Email
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
              We've sent password reset instructions to your email address
            </Typography>
          </Paper>

          <Card sx={{ width: "100%", maxWidth: 400 }}>
            <CardContent sx={{ padding: 4 }}>
              <Alert severity="success" sx={{ mb: 3 }}>
                Password reset email sent successfully! Please check your inbox and follow the instructions to reset
                your password.
              </Alert>

              <Box sx={{ textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Didn't receive the email? Check your spam folder or try again.
                </Typography>

                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleBackToLogin}
                  sx={{
                    py: 1.5,
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    background: "linear-gradient(45deg, #667eea 30%, #764ba2 90%)",
                    "&:hover": {
                      background: "linear-gradient(45deg, #5a6fd8 30%, #6a4190 90%)",
                    },
                  }}
                >
                  Back to Login
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <Paper
          elevation={8}
          sx={{
            padding: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            borderRadius: 2,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            marginBottom: 3,
          }}
        >
          <ResetIcon sx={{ fontSize: 48, mb: 2 }} />
          <Typography component="h1" variant="h4" fontWeight="bold">
            Reset Password
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
            Enter your email address and we'll send you a link to reset your password
          </Typography>
        </Paper>

        <Card sx={{ width: "100%", maxWidth: 400 }}>
          <CardContent sx={{ padding: 4 }}>
            <Box>
              {errors.general && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {errors.general}
                </Alert>
              )}

              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                type="email"
                autoFocus
                value={formData.email}
                onChange={handleInputChange("email")}
                error={!!errors.email}
                helperText={errors.email}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading}
                onClick={handleSubmit}
                sx={{
                  mt: 2,
                  mb: 2,
                  py: 1.5,
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  background: "linear-gradient(45deg, #667eea 30%, #764ba2 90%)",
                  "&:hover": {
                    background: "linear-gradient(45deg, #5a6fd8 30%, #6a4190 90%)",
                  },
                }}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : "Send Reset Email"}
              </Button>

              <Divider sx={{ my: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>

              <Box sx={{ textAlign: "center", mt: 2 }}>
                <Button
                  onClick={handleBackToLogin}
                  variant="text"
                  color="primary"
                  startIcon={<ArrowBack />}
                  sx={{ textTransform: "none", fontWeight: "bold" }}
                >
                  Back to Login
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Remember your password?{" "}
            <Button variant="text" color="primary" onClick={() => navigate("/login")} sx={{ textTransform: "none" }}>
              Sign in here
            </Button>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}
