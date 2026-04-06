import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { BrandColors } from "@/constants/theme";
import DashboardScreen from "@/screens/dashboard/DashboardScreen";
import DailyListScreen from "@/screens/visits/DailyListScreen";
import NewEntryScreen from "@/screens/visits/NewEntryScreen";
import IncidentsScreen from "@/screens/incidents/IncidentsScreen";
import NewsScreen from "@/screens/news/NewsScreen";
import SettingsScreen from "@/screens/settings/SettingsScreen";
import AdminStackNavigator from "@/navigation/AdminStackNavigator";
import { UserRole } from "@/types";

export type GuardTabParamList = {
  Dashboard: undefined;
  DailyList: undefined;
  NewEntry: undefined;
  Incidents: undefined;
  News: undefined;
  Settings: undefined;
  Admin: undefined;
};

const Tab = createBottomTabNavigator<GuardTabParamList>();

export function GuardTabNavigator() {
  const { theme } = useTheme();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(UserRole.ADMIN);

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
        name="News"
        component={NewsScreen}
        options={{ title: "Notícias", tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Definições", tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminStackNavigator}
          options={{ title: "Admin", headerShown: false, tabBarIcon: ({ color, size }) => <Feather name="shield" size={size} color={color} /> }}
        />
      )}
    </Tab.Navigator>
  );
}
