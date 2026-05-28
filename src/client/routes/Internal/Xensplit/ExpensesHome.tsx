import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ExpensesHome() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/internal/xensplit/groups", { replace: true });
  }, [navigate]);

  return null;
}