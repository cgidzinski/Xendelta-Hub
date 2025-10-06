import React, { useState, useEffect } from "react";
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
  IconButton,
} from "@mui/material";
import { Email, LockReset as ResetIcon, ArrowBack, Lock, Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
interface ResetFormData {
  email: string;
  newPassword: string;
  confirmPassword: string;
}

interface ResetErrors {
  email?: string;
  newPassword?: string;
  confirmPassword?: string;
  general?: string;
}

export default function Reset() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [formData, setFormData] = useState<ResetFormData>({
    email: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<ResetErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userInfo, setUserInfo] = useState<{ email: string; username: string } | null>(null);

  const { resetPassword, verifyResetToken, resetPasswordWithToken } = useAuth();

  // Verify token on component mount if token exists
  useEffect(() => {
    if (token) {
      verifyToken();
    }
  }, [token]);

  const verifyToken = async () => {
    setIsLoading(true);
    try {
      // Extract email from the URL or use the email from the form
      const emailFromUrl = searchParams.get("email");
      const emailToUse = emailFromUrl || formData.email;

      if (!emailToUse) {
        setTokenValid(false);
        return;
      }

      const result = await verifyResetToken(token!, emailToUse);
      if (result.status) {
        setTokenValid(true);
        setUserInfo(result.user);
        setFormData((prev) => ({ ...prev, email: result.user.email }));
      } else {
        setTokenValid(false);
      }
    } catch (error) {
      setTokenValid(false);
    } finally {
      setIsLoading(false);
    }
  };

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

    if (token) {
      // Token-based reset validation
      if (!formData.newPassword?.trim()) {
        newErrors.newPassword = "New password is required";
      } else if (formData.newPassword.length < 6) {
        newErrors.newPassword = "Password must be at least 6 characters";
      }

      if (!formData.confirmPassword?.trim()) {
        newErrors.confirmPassword = "Please confirm your password";
      } else if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    } else {
      // Email-based forgot password validation
      if (!formData.email?.trim()) {
        newErrors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = "Please enter a valid email address";
      }
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
      if (token) {
        // Token-based password reset
        const result = await resetPasswordWithToken(token, formData.newPassword, formData.email);
        if (result.status) {
          setIsSuccess(true);
        } else {
          setErrors({ general: result.message || "Failed to reset password. Please try again." });
        }
      } else {
        // Email-based forgot password
        const success = await resetPassword(formData.email);
        if (success) {
          setIsSuccess(true);
        } else {
          setErrors({ general: "Failed to send reset email. Please try again later." });
        }
      }
    } catch (error) {
      setErrors({
        general: token
          ? "Failed to reset password. Please try again."
          : "Failed to send reset email. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate("/login");
  };

  // Show loading while verifying token
  if (token && tokenValid === null) {
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
            <CircularProgress sx={{ color: "white", mb: 2 }} />
            <Typography component="h1" variant="h4" fontWeight="bold">
              Verifying Reset Link
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
              Please wait while we verify your reset link...
            </Typography>
          </Paper>
        </Box>
      </Container>
    );
  }

  // Show error if token is invalid
  if (token && tokenValid === false) {
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
              background: "linear-gradient(135deg, #f44336 0%, #d32f2f 100%)",
              color: "white",
              marginBottom: 3,
            }}
          >
            <ResetIcon sx={{ fontSize: 48, mb: 2 }} />
            <Typography component="h1" variant="h4" fontWeight="bold">
              Invalid Reset Link
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
              This reset link is invalid or has expired. Please request a new one.
            </Typography>
          </Paper>

          <Card sx={{ width: "100%", maxWidth: 400 }}>
            <CardContent sx={{ padding: 4 }}>
              <Alert severity="error" sx={{ mb: 3 }}>
                The reset link you clicked is invalid or has expired. Please request a new password reset.
              </Alert>

              <Box sx={{ textAlign: "center" }}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => navigate("/reset-password")}
                  sx={{
                    py: 1.5,
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    background: "linear-gradient(45deg, #667eea 30%, #764ba2 90%)",
                    "&:hover": {
                      background: "linear-gradient(45deg, #5a6fd8 30%, #6a4190 90%)",
                    },
                    mb: 2,
                  }}
                >
                  Request New Reset Link
                </Button>

                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleBackToLogin}
                  sx={{
                    py: 1.5,
                    fontSize: "1.1rem",
                    fontWeight: "bold",
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
              {token ? "Password Reset Successfully" : "Check Your Email"}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
              {token
                ? "Your password has been successfully reset. You can now log in with your new password."
                : "We've sent password reset instructions to your email address"}
            </Typography>
          </Paper>

          <Card sx={{ width: "100%", maxWidth: 400 }}>
            <CardContent sx={{ padding: 4 }}>
              <Alert severity="success" sx={{ mb: 3 }}>
                {token
                  ? "Password reset successfully! You can now log in with your new password."
                  : "Password reset email sent successfully! Please check your inbox and follow the instructions to reset your password."}
              </Alert>

              <Box sx={{ textAlign: "center" }}>
                {!token && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Didn't receive the email? Check your spam folder or try again.
                  </Typography>
                )}

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
            {token ? "Reset Your Password" : "Reset Password"}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mt: 1, textAlign: "center" }}>
            {token
              ? `Enter a new password for ${userInfo?.email}`
              : "Enter your email address and we'll send you a link to reset your password"}
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

              {token ? (
                // Token-based password reset form
                <>
                  <TextField
                    margin="normal"
                    fullWidth
                    id="email"
                    label="Email Address"
                    name="email"
                    type="email"
                    value={formData.email}
                    disabled
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Email color="action" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 3 }}
                  />

                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    id="newPassword"
                    label="New Password"
                    name="newPassword"
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    value={formData.newPassword}
                    onChange={handleInputChange("newPassword")}
                    error={!!errors.newPassword}
                    helperText={errors.newPassword}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            sx={{ minWidth: "auto", p: 1 }}
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 3 }}
                  />

                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    id="confirmPassword"
                    label="Confirm New Password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleInputChange("confirmPassword")}
                    error={!!errors.confirmPassword}
                    helperText={errors.confirmPassword}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            edge="end"
                            sx={{ minWidth: "auto", p: 1 }}
                          >
                            {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
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
                    {isLoading ? <CircularProgress size={24} color="inherit" /> : "Reset Password"}
                  </Button>
                </>
              ) : (
                // Email-based forgot password form
                <>
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
                </>
              )}

              {!token && (
                <>
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
                </>
              )}
            </Box>
          </CardContent>
        </Card>

        {!token && (
          <Box sx={{ mt: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Remember your password?{" "}
              <Button variant="text" color="primary" onClick={() => navigate("/login")} sx={{ textTransform: "none" }}>
                Sign in here
              </Button>
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
