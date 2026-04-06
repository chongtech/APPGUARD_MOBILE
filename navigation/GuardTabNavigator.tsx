import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { BrandColors } from "@/constants/theme";
import DashboardScreen from "@/screens/dashboard/DashboardScreen";
import DailyListScreen from "@/screens/visits/DailyListScreen";
import NewEntryScreen from "@/screens/visits/NewEntryScreen";
import IncidentsScreen from "@/screens/incidents/IncidentsScreen";
import SettingsScreen from "@/screens/settings/SettingsScreen";

export type GuardTabParamList = {
  Dashboard: undefined;
  DailyList: undefined;
  NewEntry: undefined;
  Incidents: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<GuardTabParamList>();

export function GuardTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: BrandColors.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: { backgroundColor: theme.backgroundRoot, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.backgroundRoot },
        headerTintColor: theme.text,
        headerTitleAlign: "center",
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: "Início", tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="DailyList"
        component={DailyListScreen}
        options={{ title: "Registos", tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="NewEntry"
        component={NewEntryScreen}
        options={{ title: "Nova Entrada", tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={{ title: "Ocorrências", tabBarIcon: ({ color, size }) => <Feather name="alert-triangle" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Definições", tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
