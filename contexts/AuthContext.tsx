import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/services/dataService";
import { logger, LogCategory } from "@/services/logger";
import type { Staff, UserRole } from "@/types";

interface AuthState {
  staff: Staff | null;
  isLoading: boolean;
  isDeviceConfigured: boolean;
  condominiumId: number | null;
}

interface AuthContextValue extends AuthState {
  login: (firstName: string, lastName: string, pin: string) => Promise<Staff | null>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    staff: null,
    isLoading: true,
    isDeviceConfigured: false,
    condominiumId: null,
  });

  const refreshSession = useCallback(async () => {
    try {
      await api.init();

      const [configured, sessionStaff] = await Promise.all([
        api.isDeviceConfigured(),
        api.getSessionStaff(),
      ]);

      setState({
        staff: sessionStaff,
        isLoading: false,
        isDeviceConfigured: configured,
        condominiumId: api.currentCondoId,
      });
    } catch (error) {
      logger.error(LogCategory.AUTH, "refreshSession failed", error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refreshSession();
    return () => api.destroy();
  }, [refreshSession]);

  const login = useCallback(
    async (firstName: string, lastName: string, pin: string): Promise<Staff | null> => {
      const staff = await api.login(firstName, lastName, pin);
      if (staff) {
        setState((prev) => ({ ...prev, staff }));
      }
      return staff;
    },
    []
  );

  const logout = useCallback(async () => {
    await api.logout();
    setState((prev) => ({ ...prev, staff: null }));
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!state.staff) return false;
      return roles.includes(state.staff.role);
    },
    [state.staff]
  );

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshSession, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
