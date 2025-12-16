import React, { useState } from "react";
import { TextField, TextFieldProps, InputAdornment, IconButton } from "@mui/material";
import { Visibility, VisibilityOff, Lock } from "@mui/icons-material";

interface PasswordFieldProps extends Omit<TextFieldProps, "type"> {
  showPasswordToggle?: boolean;
}

export default function PasswordField({ showPasswordToggle = true, ...props }: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  const handleTogglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <TextField
      {...props}
      type={showPassword ? "text" : "password"}
      InputProps={{
        ...props.InputProps,
        startAdornment: (
          <InputAdornment position="start">
            <Lock color="action" />
          </InputAdornment>
        ),
        endAdornment: showPasswordToggle ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="toggle password visibility"
              onClick={handleTogglePasswordVisibility}
              edge="end"
            >
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ) : undefined,
      }}
    />
  );
}

