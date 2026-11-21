import { useEffect } from "react";
import { Outlet, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../contexts/AuthContext";
import { TimerProvider, useTimers } from "./TimerProvider";

export default function TimerLayout() {
  const { user } = useAuth();
  return (
    <TimerProvider owner={user?.id} key={user?.id}>
      <TimerLink />
      <Outlet />
    </TimerProvider>
  );
}

function TimerLink() {
  const [params, setParams] = useSearchParams();
  const { open } = useTimers();
  const id = params.get("timer");
  useEffect(() => {
    if (!id) return;
    open(id);
    const next = new URLSearchParams(params);
    next.delete("timer");
    setParams(next, { replace: true });
  }, [id, open, params, setParams]);
  return null;
}
