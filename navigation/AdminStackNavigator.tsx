import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AdminDashboardScreen from "@/screens/admin/AdminDashboard";
import AdminAnalyticsScreen from "@/screens/admin/AdminAnalytics";
import AdminStaffScreen from "@/screens/admin/AdminStaff";
import AdminUnitsScreen from "@/screens/admin/AdminUnits";
import AdminResidentsScreen from "@/screens/admin/AdminResidents";
import AdminVisitsScreen from "@/screens/admin/AdminVisits";
import AdminIncidentsScreen from "@/screens/admin/AdminIncidents";
import AdminVisitTypesScreen from "@/screens/admin/AdminVisitTypes";
import AdminServiceTypesScreen from "@/screens/admin/AdminServiceTypes";
import AdminRestaurantsScreen from "@/screens/admin/AdminRestaurants";
import AdminSportsScreen from "@/screens/admin/AdminSports";
import AdminDevicesScreen from "@/screens/admin/AdminDevices";
import AdminDeviceRegistrationErrorsScreen from "@/screens/admin/AdminDeviceRegistrationErrors";
import AdminNewsScreen from "@/screens/admin/AdminNews";
import AdminAuditLogsScreen from "@/screens/admin/AdminAuditLogs";
import AdminCondominiumsScreen from "@/screens/admin/AdminCondominiums";
import AdminSubscriptionsScreen from "@/screens/admin/AdminSubscriptions";

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminAnalytics: undefined;
  AdminStaff: undefined;
  AdminUnits: undefined;
  AdminResidents: undefined;
  AdminVisits: undefined;
  AdminIncidents: undefined;
  AdminVisitTypes: undefined;
  AdminServiceTypes: undefined;
  AdminRestaurants: undefined;
  AdminSports: undefined;
  AdminDevices: undefined;
  AdminDeviceRegistrationErrors: undefined;
  AdminNews: undefined;
  AdminAuditLogs: undefined;
  AdminCondominiums: undefined;
  AdminSubscriptions: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="AdminDashboard"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
      <Stack.Screen name="AdminStaff" component={AdminStaffScreen} />
      <Stack.Screen name="AdminUnits" component={AdminUnitsScreen} />
      <Stack.Screen name="AdminResidents" component={AdminResidentsScreen} />
      <Stack.Screen name="AdminVisits" component={AdminVisitsScreen} />
      <Stack.Screen name="AdminIncidents" component={AdminIncidentsScreen} />
      <Stack.Screen name="AdminVisitTypes" component={AdminVisitTypesScreen} />
      <Stack.Screen
        name="AdminServiceTypes"
        component={AdminServiceTypesScreen}
      />
      <Stack.Screen
        name="AdminRestaurants"
        component={AdminRestaurantsScreen}
      />
      <Stack.Screen name="AdminSports" component={AdminSportsScreen} />
      <Stack.Screen name="AdminDevices" component={AdminDevicesScreen} />
      <Stack.Screen
        name="AdminDeviceRegistrationErrors"
        component={AdminDeviceRegistrationErrorsScreen}
      />
      <Stack.Screen name="AdminNews" component={AdminNewsScreen} />
      <Stack.Screen name="AdminAuditLogs" component={AdminAuditLogsScreen} />
      <Stack.Screen
        name="AdminCondominiums"
        component={AdminCondominiumsScreen}
      />
      <Stack.Screen
        name="AdminSubscriptions"
        component={AdminSubscriptionsScreen}
      />
    </Stack.Navigator>
  );
}
