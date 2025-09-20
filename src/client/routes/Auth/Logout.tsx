import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

interface LoginFormData {
  username: string;
  password: string;
}

interface LoginErrors {
  username?: string;
  password?: string;
  general?: string;
}

export default function Logout() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    logout();
    navigate("/login", { replace: true });
  }, []);
  
  return null;
}
