import { Button, ButtonProps, CircularProgress } from "@mui/material";

interface FormLoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
}

export default function FormLoadingButton({
  loading = false,
  loadingText,
  children,
  disabled,
  ...props
}: FormLoadingButtonProps) {
  return (
    <Button {...props} disabled={disabled || loading}>
      {loading && <CircularProgress size={20} sx={{ mr: 1 }} />}
      {loading && loadingText ? loadingText : children}
    </Button>
  );
}

