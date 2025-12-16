import React, { useState } from "react";
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
    (field: keyof SignupFormData) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | any) => {
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
      <Container component="main" maxWidth="md" sx={{ flex: 1, display: "flex", alignItems: "center" }}>
        <Box
          sx={{
            width: "100%",
            marginTop: 4,
            marginBottom: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingBottom: 4,
          }}
        >
        <Paper
          elevation={0}
          sx={{
            padding: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            borderRadius: 2,
            backgroundColor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            marginBottom: 3,
            position: "relative",
            "&::before": {
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
              width: 64,
              height: 64,
              borderRadius: 2,
              backgroundColor: "transparent",
              border: "2px solid",
              borderColor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.main",
              mb: 2,
              boxShadow: "0 0 15px rgba(0, 245, 255, 0.2)",
            }}
          >
            <SignupIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography
            component="h1"
            variant="h4"
            fontWeight="bold"
            sx={{
              background: "linear-gradient(90deg, #00f5ff 0%, #00d4ff 50%, #00a8ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Join Xendelta Hub
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
            Create your account to get started
          </Typography>
        </Paper>

        <Card sx={{ width: "100%", maxWidth: 600 }}>
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
      </Container>
    </Box>
  );
}
