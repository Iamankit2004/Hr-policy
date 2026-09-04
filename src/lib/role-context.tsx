import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "admin" | "employee";

const STORAGE_KEY = "policypilot.role";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("employee");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "admin" || stored === "employee") setRoleState(stored);
  }, []);

  const setRole = (next: Role) => {
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider.");
  return ctx;
}
