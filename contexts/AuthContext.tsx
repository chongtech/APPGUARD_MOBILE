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
    const withTimeout = <T,>(
      label: string,
      p: Promise<T>,
      ms: number,
      fallback: T,
    ): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((resolve) =>
          setTimeout(() => {
            logger.warn(LogCategory.AUTH, `${label} timeout (${ms}ms)`);
            resolve(fallback);
          }, ms),
        ),
      ]);

    try {
      logger.info(LogCategory.AUTH, "refreshSession: api.init start");
      await withTimeout("api.init", api.init(), 5000, undefined);
      logger.info(LogCategory.AUTH, "refreshSession: api.init ok");

      const [configured, sessionStaff] = await Promise.all([
        withTimeout(
          "isDeviceConfigured",
          api.isDeviceConfigured(),
          4000,
          false,
        ),
        withTimeout<Staff | null>(
          "getSessionStaff",
          api.getSessionStaff(),
          4000,
          null,
        ),
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
      // Always release the splash — fall through to AuthNavigator so the user
      // can reach setup/login instead of being stuck on the loading state.
      setState({
        staff: null,
        isLoading: false,
        isDeviceConfigured: false,
        condominiumId: null,
      });
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
