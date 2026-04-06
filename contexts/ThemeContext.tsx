import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/theme";
import { Theme } from "@/types";

type ColorSet = typeof Colors.light;

interface ThemeContextValue {
  theme: ColorSet;
  themeName: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "app_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeState] = useState<Theme>(Theme.ELITE);

  React.useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === Theme.MIDNIGHT) setThemeState(Theme.MIDNIGHT);
    });
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    AsyncStorage.setItem(THEME_KEY, newTheme).catch(() => {});
  }, []);

  const isDark = themeName === Theme.MIDNIGHT;
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ theme, themeName, isDark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
