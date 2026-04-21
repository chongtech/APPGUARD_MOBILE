import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@/hooks/useTheme";
import { getCommonScreenOptions } from "@/navigation/screenOptions";
import SetupScreen from "@/screens/setup/SetupScreen";
import LoginScreen from "@/screens/auth/LoginScreen";

export type AuthStackParamList = {
  Setup: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { theme, isDark } = useTheme();
  const screenOptions = getCommonScreenOptions({ theme, isDark });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Setup"
        component={SetupScreen}
        options={{ title: "Configuração" }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: "Entrar" }}
      />
    </Stack.Navigator>
  );
}
