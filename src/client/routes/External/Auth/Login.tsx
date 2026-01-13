import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Container,
  InputAdornment,
  Paper,
  Divider,
  Grid,
} from "@mui/material";
import { Login as LoginIcon, Person } from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import LandingHeader from "../../../components/LandingHeader";
import PasswordField from "../../../components/PasswordField";
import FormErrorAlert from "../../../components/forms/FormErrorAlert";
import FormLoadingButton from "../../../components/forms/FormLoadingButton";
import { validateUsername, validatePassword } from "../../../utils/formValidation";

interface LoginFormData {
  username: string;
  password: string;
}

interface LoginErrors {
  username?: string;
  password?: string;
  general?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    username: "testuser",
    password: "Password123",
  });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: keyof LoginFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
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
    const newErrors: LoginErrors = {};

    const usernameError = validateUsername(formData.username);
    if (usernameError) {
      newErrors.username = usernameError;
    }

    const passwordError = validatePassword(formData.password, { minLength: 6 });
    if (passwordError) {
      newErrors.password = passwordError;
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

    const success = await login(formData.username, formData.password);

    if (success) {
      // Redirect to the page they were trying to access, or internal by default
      const from = location.state?.from?.pathname;
      navigate(from || "/internal", { replace: true });
    } else {
      setErrors({ general: "Invalid username or password" });
    }
    
    setIsLoading(false);
  };


  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <LandingHeader />
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", py: { xs: 4, md: 0 } }}>
        <Container maxWidth="lg" sx={{ width: "100%" }}>
          <Grid container spacing={0} sx={{ minHeight: { md: "70vh" } }}>
            {/* Left Side - Welcome Section */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: { xs: "center", md: "flex-start" },
                  px: { xs: 2, md: 6 },
                  py: { xs: 4, md: 8 },
                  textAlign: { xs: "center", md: "left" },
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 4, md: 12 },
                    borderRadius: 4,
                    backgroundColor: "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                    position: "relative",
                    overflow: "hidden",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: "-50%",
                      left: "-50%",
                      width: "200%",
                      height: "200%",
                      background: "radial-gradient(circle, rgba(0, 245, 255, 0.1) 0%, transparent 70%)",
                      animation: "pulse 8s ease-in-out infinite",
                      "@keyframes pulse": {
                        "0%, 100%": { transform: "scale(1) rotate(0deg)" },
                        "50%": { transform: "scale(1.1) rotate(180deg)" },
                      },
                    },
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "2px",
                      background: "linear-gradient(90deg, transparent, #00f5ff, transparent)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      width: 80,
                      height: 80,
                      borderRadius: 3,
                      backgroundColor: "transparent",
                      border: "2px solid",
                      borderColor: "primary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "primary.main",
                      mb: 3,
                      mx: { xs: "auto", md: 0 },
                      boxShadow: "0 0 30px rgba(0, 245, 255, 0.4)",
                      animation: "glow 2s ease-in-out infinite alternate",
                      "@keyframes glow": {
                        from: { boxShadow: "0 0 30px rgba(0, 245, 255, 0.4)" },
                        to: { boxShadow: "0 0 50px rgba(0, 245, 255, 0.7)" },
                      },
                    }}
                  >
                    <LoginIcon sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography
                    component="h1"
                    variant="h3"
                    fontWeight="bold"
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      mb: 2,
                      background: "linear-gradient(135deg, #00f5ff 0%, #00d4ff 50%, #00a8ff 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      fontSize: { xs: "2rem", md: "2.5rem" },
                    }}
                  >
                    Welcome Back
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      color: "text.secondary",
                      mb: 3,
                      fontWeight: 400,
                      lineHeight: 1.6,
                    }}
                  >
                    Sign in to your Xendelta Hub account and continue your journey
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      color: "text.secondary",
                      opacity: 0.8,
                    }}
                  >
                    Experience seamless collaboration, secure messaging, and powerful features designed for modern teams.
                  </Typography>
                </Paper>
              </Box>
            </Grid>

            {/* Right Side - Login Form */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  px: { xs: 2, md: 6 },
                  py: { xs: 4, md: 8 },
                }}
              >
                <Card
                  elevation={0}
                  sx={{
                    width: "100%",
                    maxWidth: 500,
                    mx: "auto",
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    backgroundColor: "background.paper",
                  }}
                >
                  <CardContent sx={{ padding: 4 }}>
                    <Box>
                      {errors.general && <FormErrorAlert message={errors.general} sx={{ mb: 2 }} />}

                      <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="username"
                        label="Username"
                        name="username"
                        autoFocus
                        value={formData.username}
                        onChange={handleInputChange("username")}
                        error={!!errors.username}
                        helperText={errors.username}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Person color="action" />
                            </InputAdornment>
                          ),
                        }}
                        sx={{ mb: 2 }}
                      />

                      <PasswordField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Password"
                        id="password"
                        value={formData.password}
                        onChange={handleInputChange("password")}
                        error={!!errors.password}
                        helperText={errors.password}
                        sx={{ mb: 3 }}
                      />

                      <FormLoadingButton
                        type="submit"
                        fullWidth
                        variant="contained"
                        loading={isLoading}
                        loadingText="Signing in..."
                        onClick={handleSubmit}
                        sx={{
                          mt: 2,
                          mb: 2,
                          py: 1.5,
                          fontSize: "1.1rem",
                          fontWeight: 600,
                          backgroundColor: "primary.main",
                          boxShadow: "0 0 20px rgba(0, 245, 255, 0.3)",
                          "&:hover": {
                            backgroundColor: "primary.dark",
                            boxShadow: "0 0 30px rgba(0, 245, 255, 0.5)",
                          },
                          "&:disabled": {
                            boxShadow: "none",
                          },
                        }}
                      >
                        Sign In
                      </FormLoadingButton>

                      <Divider sx={{ my: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          OR
                        </Typography>
                      </Divider>

                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => window.location.href = '/api/auth/google'}
                        sx={{
                          mt: 2,
                          mb: 2,
                          py: 1.5,
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          backgroundColor: "#ffffff",
                          color: "#3c4043",
                          border: "1px solid #dadce0",
                          borderRadius: "8px",
                          textTransform: "none",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
                          "&:hover": {
                            backgroundColor: "#f8f9fa",
                            borderColor: "#dadce0",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.2)",
                          },
                          "&:active": {
                            backgroundColor: "#f1f3f4",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Continue with Google
                        </Box>
                      </Button>

                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => window.location.href = '/api/auth/github'}
                        sx={{
                          mt: 1,
                          mb: 2,
                          py: 1.5,
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          backgroundColor: "#24292e",
                          color: "#ffffff",
                          border: "1px solid #24292e",
                          borderRadius: "8px",
                          textTransform: "none",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
                          "&:hover": {
                            backgroundColor: "#1a1e22",
                            borderColor: "#1a1e22",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.2)",
                          },
                          "&:active": {
                            backgroundColor: "#0d1117",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                          Continue with GitHub
                        </Box>
                      </Button>

                      <Box sx={{ textAlign: "center", mt: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Don't have an account?{" "}
                          <Button
                            onClick={() => navigate("/signup")}
                            variant="text"
                            color="primary"
                            sx={{ textTransform: "none", fontWeight: "bold" }}
                          >
                            Sign up here
                          </Button>
                        </Typography>
                      </Box>

                      <Box sx={{ textAlign: "center", mt: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Forgot your password?{" "}
                          <Button
                            variant="text"
                            color="primary"
                            onClick={() => navigate("/reset-password")}
                            sx={{ textTransform: "none" }}
                          >
                            Reset it here
                          </Button>
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
