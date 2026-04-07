import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { logger, LogCategory } from "@/services/logger";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { Condominium } from "@/types";
import type { AuthStackParamList } from "@/navigation/AuthNavigator";

type NavProp = NativeStackNavigationProp<AuthStackParamList, "Setup">;

export default function SetupScreen() {
  const { theme } = useTheme();
  const { refreshSession } = useAuth();
  const navigation = useNavigation<NavProp>();

  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [selected, setSelected] = useState<Condominium | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadCondominiums();
  }, []);

  async function loadCondominiums() {
    setIsLoading(true);
    try {
      await api.init();
      const list = await api.getCondominiums();
      setCondominiums(list.filter((c) => c.status === "ACTIVE"));
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: loadCondominiums failed",
        error,
      );
      Alert.alert(
        "Erro",
        "Não foi possível carregar os condomínios. Verifique a ligação à internet.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfigure() {
    if (!selected) return;
    setIsConfiguring(true);
    try {
      await api.configureDevice(selected.id);
      await refreshSession();
      navigation.navigate("Login");
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: configureDevice failed",
        error,
      );
      Alert.alert(
        "Erro",
        "Não foi possível configurar o dispositivo. Tente novamente.",
      );
    } finally {
      setIsConfiguring(false);
    }
  }

  const filteredCondominiums = condominiums.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderItem = ({ item }: { item: Condominium }) => {
    const isSelected = selected?.id === item.id;
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={[
          styles.condoItem,
          {
            backgroundColor: theme.cardBackground,
            borderColor: isSelected ? BrandColors.primary : theme.border,
          },
          isSelected && styles.condoItemSelected,
        ]}
      >
        <View style={styles.condoItemContent}>
          <View
            style={[
              styles.condoIcon,
              { backgroundColor: BrandColors.primary + "15" },
            ]}
          >
            <Feather name="home" size={24} color={BrandColors.primary} />
          </View>
          <View style={styles.condoInfo}>
            <ThemedText type="h4">{item.name}</ThemedText>
            {item.address && (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.address}
              </ThemedText>
            )}
          </View>
          {isSelected && (
            <Feather
              name="check-circle"
              size={24}
              color={BrandColors.primary}
            />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View
          style={[
            styles.logoContainer,
            { backgroundColor: BrandColors.primary + "15" },
          ]}
        >
          <Feather name="shield" size={48} color={BrandColors.primary} />
        </View>
        <ThemedText type="h1" style={styles.title}>
          EntryFlow Guard
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Selecione o condomínio para configurar este dispositivo
        </ThemedText>
      </View>

      {!isLoading && condominiums.length > 0 && (
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <Feather name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Pesquisar condomínio..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={BrandColors.primary}
            style={styles.loader}
          />
        ) : condominiums.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="wifi-off" size={48} color={theme.textSecondary} />
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              Sem ligação à internet. Não é possível configurar o dispositivo
              offline.
            </ThemedText>
            <Button onPress={loadCondominiums} style={styles.retryButton}>
              Tentar novamente
            </Button>
          </View>
        ) : filteredCondominiums.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="search" size={40} color={theme.textSecondary} />
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              {`Nenhum condomínio encontrado para "${searchQuery}"`}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={filteredCondominiums}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <View style={styles.footer}>
        <Button
          onPress={handleConfigure}
          disabled={!selected || isConfiguring}
          style={styles.configureButton}
        >
          {isConfiguring ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            "Configurar Dispositivo"
          )}
        </Button>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: Spacing["2xl"],
    paddingHorizontal: Spacing.xl,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: { marginBottom: Spacing.sm, textAlign: "center" },
  subtitle: { textAlign: "center", lineHeight: 22 },
  loader: { flex: 1 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  emptyText: { textAlign: "center", lineHeight: 22 },
  retryButton: { width: 200 },
  content: { flex: 1 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 16, height: 40 },
  list: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing["2xl"],
  },
  condoItem: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.lg,
  },
  condoItemSelected: { borderWidth: 2 },
  condoItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  condoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  condoInfo: { flex: 1, gap: 2 },
  footer: { padding: Spacing.xl, paddingBottom: Spacing["4xl"] },
  configureButton: { width: "100%" },
});
