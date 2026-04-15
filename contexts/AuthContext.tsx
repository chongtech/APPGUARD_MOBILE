import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
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
  login: (
    firstName: string,
    lastName: string,
    pin: string,
  ) => Promise<Staff | null>;
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
      logger.info(LogCategory.AUTH, "refreshSession: api.init start");
      // Hard timeout so a stuck SQLite/Supabase init doesn't freeze the splash forever.
      await Promise.race([
        api.init(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("api.init timeout (8s)")), 8000),
        ),
      ]);
      logger.info(LogCategory.AUTH, "refreshSession: api.init ok");

      const [configured, sessionStaff] = await Promise.all([
        api.isDeviceConfigured(),
        api.getSessionStaff(),
      ]);
      logger.info(LogCategory.AUTH, "refreshSession: session queries ok", {
        configured,
        hasStaff: !!sessionStaff,
      });

      if (sessionStaff) {
        logger.setUser({
          id: sessionStaff.id,
          name: `${sessionStaff.first_name} ${sessionStaff.last_name}`,
          role: sessionStaff.role,
          condominiumId: api.currentCondoId,
        });
      }
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
    async (
      firstName: string,
      lastName: string,
      pin: string,
    ): Promise<Staff | null> => {
      const staff = await api.login(firstName, lastName, pin);
      if (staff) {
        setState((prev) => ({ ...prev, staff }));
        logger.setUser({
          id: staff.id,
          name: `${staff.first_name} ${staff.last_name}`,
          role: staff.role,
          condominiumId: api.currentCondoId,
        });
      }
      return staff;
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.logout();
    logger.clearUser();
    setState((prev) => ({ ...prev, staff: null }));
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!state.staff) return false;
      return roles.includes(state.staff.role);
    },
    [state.staff],
  );

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, refreshSession, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
