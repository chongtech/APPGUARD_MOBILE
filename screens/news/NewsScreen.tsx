import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { useNetInfo } from "@/hooks/useNetInfo";
import {
  BrandColors,
  Spacing,
  BorderRadius,
  StatusColors,
} from "@/constants/theme";
import type { CondominiumNews } from "@/types";

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  const d = Math.floor(diffMs / 86400000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  if (h < 24) return `há ${h} hora${h !== 1 ? "s" : ""}`;
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NewsScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const { isOnline } = useNetInfo();
  const [news, setNews] = useState<CondominiumNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CondominiumNews | null>(null);

  const loadNews = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      if (staff?.condominium_id) {
        const data = await api.getNews(staff.condominium_id);
        setNews(data);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [staff?.condominium_id],
  );

  useEffect(() => {
    loadNews();
    const interval = setInterval(() => {
      if (isOnline) loadNews(true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadNews, isOnline]);

  const renderItem = ({ item }: { item: CondominiumNews }) => (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.9 : 1 },
      ]}
      onPress={() => setSelected(item)}
    >
      <View style={styles.cardTop}>
        {item.category_label ? (
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryText}>
              {item.category_label.toUpperCase()}
            </ThemedText>
          </View>
        ) : (
          <View />
        )}
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          <Feather name="clock" size={12} />{" "}
          {item.created_at ? formatRelativeTime(item.created_at) : ""}
        </ThemedText>
      </View>
      <ThemedText type="h4" style={{ marginTop: Spacing.xs }}>
        {item.title}
      </ThemedText>
      {item.description && (
        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginTop: 4 }}
          numberOfLines={2}
        >
          {item.description}
        </ThemedText>
      )}
      <ThemedText
        style={{
          color: BrandColors.primary,
          fontWeight: "700",
          fontSize: 14,
          marginTop: Spacing.sm,
        }}
      >
        Ler Mais →
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {!isOnline && (
        <View
          style={[
            styles.offlineBanner,
            { backgroundColor: StatusColors.warning + "20" },
          ]}
        >
          <Feather name="wifi-off" size={14} color={StatusColors.warning} />
          <ThemedText type="small" style={{ color: StatusColors.warning }}>
            Modo offline — dados em cache
          </ThemedText>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(n) => String(n.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => loadNews(true)}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="file-text" size={48} color={theme.textSecondary} />
              <ThemedText
                style={{ color: theme.textSecondary, marginTop: Spacing.md }}
              >
                Não há notícias nos últimos 7 dias.
              </ThemedText>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={styles.overlay}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <View
                style={[
                  styles.sheetHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <ThemedText type="h3">Notícia</ThemedText>
                <Pressable onPress={() => setSelected(null)}>
                  <Feather name="x" size={24} color={theme.textSecondary} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
              >
                {selected.image_url && (
                  <Image
                    source={{ uri: selected.image_url }}
                    style={styles.newsImage}
                    resizeMode="cover"
                  />
                )}
                {selected.category_label && (
                  <View
                    style={[styles.categoryBadge, { alignSelf: "flex-start" }]}
                  >
                    <ThemedText style={styles.categoryText}>
                      {selected.category_label.toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="h2">{selected.title}</ThemedText>
                {selected.created_at && (
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    <Feather name="calendar" size={13} />{" "}
                    {formatFullDate(selected.created_at)}
                  </ThemedText>
                )}
                {selected.description && (
                  <ThemedText
                    type="body"
                    style={{ color: theme.textSecondary }}
                  >
                    {selected.description}
                  </ThemedText>
                )}
                {selected.content && (
                  <ThemedText type="body">{selected.content}</ThemedText>
                )}
              </ScrollView>
              <Pressable
                style={[
                  styles.closeBtn,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
                onPress={() => setSelected(null)}
              >
                <ThemedText style={{ fontWeight: "700" }}>Fechar</ThemedText>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing["3xl"],
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    margin: Spacing.lg,
    borderRadius: BorderRadius.xs,
  },
  card: { borderRadius: BorderRadius.md, padding: Spacing.lg, gap: 4 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 99,
  },
  categoryText: { color: "#065F46", fontSize: 11, fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "90%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  newsImage: { width: "100%", height: 180, borderRadius: BorderRadius.sm },
  closeBtn: {
    margin: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
});
