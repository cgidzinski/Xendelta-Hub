// Email validation
export const validateEmail = (email: string): string | undefined => {
  if (!email?.trim()) {
    return "Email is required";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address";
  }
  return undefined;
};

// Username validation
export const validateUsername = (username: string, minLength: number = 3): string | undefined => {
  if (!username.trim()) {
    return "Username is required";
  }
  if (username.length < minLength) {
    return `Username must be at least ${minLength} characters`;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return "Username can only contain letters, numbers, and underscores";
  }
  return undefined;
};

// Password validation with configurable requirements
export interface PasswordValidationOptions {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecialChar?: boolean;
}

export const validatePassword = (
  password: string,
  options: PasswordValidationOptions = {}
): string | undefined => {
  const {
    minLength = 6,
    requireUppercase = false,
    requireLowercase = false,
    requireNumber = false,
    requireSpecialChar = false,
  } = options;

  if (!password) {
    return "Password is required";
  }

  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }

  if (requireUppercase && !/(?=.*[A-Z])/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (requireLowercase && !/(?=.*[a-z])/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (requireNumber && !/(?=.*\d)/.test(password)) {
    return "Password must contain at least one number";
  }

  if (requireSpecialChar && !/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
    return "Password must contain at least one special character";
  }

  return undefined;
};

// Password matching validation
export const validatePasswordMatch = (
  password: string,
  confirmPassword: string
): string | undefined => {
  if (!confirmPassword?.trim()) {
    return "Please confirm your password";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return undefined;
};

// Combined password validation for signup (stronger requirements)
export const validateSignupPassword = (password: string): string | undefined => {
  return validatePassword(password, {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
  });
};