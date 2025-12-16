import { Alert, AlertProps } from "@mui/material";

interface FormErrorAlertProps extends AlertProps {
  message: string;
}

export default function FormErrorAlert({ message, ...props }: FormErrorAlertProps) {
  return (
    <Alert severity="error" {...props}>
      {message}
    </Alert>
  );
}

