import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";

export default function Logout() {
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();

  useEffect(() => {
    logout();
    // Small delay to ensure state updates propagate before navigation
    const timer = setTimeout(() => {
      navigate("/", { replace: true });
    }, 0);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount
  
  return null;
}
