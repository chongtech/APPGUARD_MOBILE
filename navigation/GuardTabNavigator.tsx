import React from "react";
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
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
import ResidentSearchScreen from "@/screens/residents/ResidentSearchScreen";
import AdminStackNavigator from "@/navigation/AdminStackNavigator";
import { UserRole } from "@/types";

export type GuardTabParamList = {
  Dashboard: undefined;
  DailyList: undefined;
  NewEntry: undefined;
  Incidents: undefined;
  News: undefined;
  ResidentSearch: undefined;
  Settings: undefined;
  Admin: undefined;
};

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

const Tab = createBottomTabNavigator<GuardTabParamList>();

function tabOptions(
  title: string,
  icon: FeatherIconName,
  extra?: Partial<BottomTabNavigationOptions>,
): BottomTabNavigationOptions {
  return {
    title,
    tabBarIcon: ({ color, size }) => (
      <Feather name={icon} size={size} color={color} />
    ),
    ...extra,
  };
}

export function GuardTabNavigator() {
  const { theme } = useTheme();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(UserRole.ADMIN);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: BrandColors.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.backgroundRoot,
          borderTopColor: theme.border,
        },
        headerStyle: { backgroundColor: theme.backgroundRoot },
        headerTintColor: theme.text,
        headerTitleAlign: "center",
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={tabOptions("Início", "home")}
      />
      <Tab.Screen
        name="DailyList"
        component={DailyListScreen}
        options={tabOptions("Registos", "list")}
      />
      <Tab.Screen
        name="NewEntry"
        component={NewEntryScreen}
        options={tabOptions("Nova Entrada", "plus-circle")}
      />
      <Tab.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={tabOptions("Ocorrências", "alert-triangle")}
      />
      <Tab.Screen
        name="News"
        component={NewsScreen}
        options={tabOptions("Notícias", "file-text")}
      />
      <Tab.Screen
        name="ResidentSearch"
        component={ResidentSearchScreen}
        options={tabOptions("Moradores", "users")}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={tabOptions("Definições", "settings")}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminStackNavigator}
          options={tabOptions("Admin", "shield", { headerShown: false })}
        />
      )}
    </Tab.Navigator>
  );
}
