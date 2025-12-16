import React from "react";
import { Button } from "@mui/material";
import { Google as GoogleIcon, GitHub as GitHubIcon, Email as EmailIcon } from "@mui/icons-material";

// Provider configuration
export const PROVIDER_CONFIG = {
  google: {
    name: "Google",
    icon: GoogleIcon,
    buttonText: "Link Google Account",
  },
  github: {
    name: "GitHub",
    icon: GitHubIcon,
    buttonText: "Link GitHub Account",
  },
  local: {
    name: "Email & Password",
    icon: EmailIcon,
    buttonText: "Add Password",
  },
} as const;

// Common button styles
const COMMON_BUTTON_STYLES = {
  backgroundColor: "#24292e",
  color: "#ffffff",
  border: "1px solid #24292e",
  borderRadius: "8px",
  textTransform: "none" as const,
  fontWeight: 500,
  fontSize: "0.9rem",
  py: 1,
  px: 2,
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
  "&:disabled": {
    backgroundColor: "#6c757d",
    color: "#ffffff",
    borderColor: "#6c757d",
  },
};

interface AuthButtonProps {
  provider: keyof typeof PROVIDER_CONFIG;
  onClick: () => void;
  disabled?: boolean;
  variant?: "contained" | "outlined";
}

export default function AuthButton(props: AuthButtonProps) {
  const { provider, onClick, disabled, variant = "contained" } = props;
  const config = PROVIDER_CONFIG[provider];
  const IconComponent = config.icon;

  return (
    <Button
      variant={variant}
      startIcon={<IconComponent />}
      onClick={onClick}
      disabled={disabled}
      sx={COMMON_BUTTON_STYLES}
    >
      {config.buttonText}
    </Button>
  );
}
