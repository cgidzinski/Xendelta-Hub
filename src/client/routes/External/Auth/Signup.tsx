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
import { PersonAdd as SignupIcon, Person, Email } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import LandingHeader from "../../../components/LandingHeader";
import PasswordField from "../../../components/PasswordField";
import FormErrorAlert from "../../../components/forms/FormErrorAlert";
import FormLoadingButton from "../../../components/forms/FormLoadingButton";
import { validateUsername, validateEmail, validateSignupPassword, validatePasswordMatch } from "../../../utils/formValidation";

interface SignupFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface SignupErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [formData, setFormData] = useState<SignupFormData>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<SignupErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange =
    (field: keyof SignupFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormData((prev) => ({
        ...prev,
        [field]: value,
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
    const newErrors: SignupErrors = {};

    const usernameError = validateUsername(formData.username);
    if (usernameError) {
      newErrors.username = usernameError;
    }

    const emailError = validateEmail(formData.email);
    if (emailError) {
      newErrors.email = emailError;
    }

    const passwordError = validateSignupPassword(formData.password);
    if (passwordError) {
      newErrors.password = passwordError;
    }

    const confirmPasswordError = validatePasswordMatch(formData.password, formData.confirmPassword);
    if (confirmPasswordError) {
      newErrors.confirmPassword = confirmPasswordError;
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

    const success = await signup({
      username: formData.username,
      email: formData.email,
      password: formData.password,
    });

    if (success) {
      navigate("/internal", { replace: true });
    } else {
      setErrors({ general: "Signup failed. Username or email may already be taken." });
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
                    <SignupIcon sx={{ fontSize: 40 }} />
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
                    Join Xendelta Hub
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
                    Create your account and start your journey with us
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
                    Join thousands of teams already using Xendelta Hub for seamless collaboration and productivity.
                  </Typography>
                </Paper>
              </Box>
            </Grid>

            {/* Right Side - Signup Form */}
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

                      <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="email"
                        label="Email Address"
                        name="email"
                        type="email"
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
                        sx={{ mb: 2 }}
                      />

                      <PasswordField
                        margin="normal"
                        required
                        fullWidth
                        name="confirmPassword"
                        label="Confirm Password"
                        id="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange("confirmPassword")}
                        error={!!errors.confirmPassword}
                        helperText={errors.confirmPassword}
                        sx={{ mb: 3 }}
                      />

                      <FormLoadingButton
                        type="submit"
                        fullWidth
                        variant="contained"
                        loading={isLoading}
                        loadingText="Creating account..."
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
                        Create Account
                      </FormLoadingButton>

                      <Divider sx={{ my: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          OR
                        </Typography>
                      </Divider>

                      <Box sx={{ textAlign: "center", mt: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Already have an account?{" "}
                          <Button
                            onClick={() => navigate("/login")}
                            variant="text"
                            color="primary"
                            sx={{ textTransform: "none", fontWeight: "bold" }}
                          >
                            Sign in here
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
