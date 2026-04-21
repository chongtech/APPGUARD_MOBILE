import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { supabase } from "@/lib/supabase";
import { logger, LogCategory } from "@/services/logger";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { CondominiumNews } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminNews() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<CondominiumNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CondominiumNews | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageLocalUri, setImageLocalUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [condoId, setCondoId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.adminGetAllNews());
    } catch (loadError) {
      logger.warn(LogCategory.UI, "AdminNews: load failed", {
        error: String(loadError),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setCategoryName("");
    setImageUrl("");
    setImageLocalUri(null);
    setCondoId("");
    setModalOpen(true);
  };
  const openEdit = (n: CondominiumNews) => {
    setEditing(n);
    setTitle(n.title);
    setContent(n.content ?? "");
    setCategoryName(n.category_name ?? "");
    setImageUrl(n.image_url ?? "");
    setImageLocalUri(null);
    setCondoId(String(n.condominium_id));
    setModalOpen(true);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted)
      return Alert.alert("Permissão", "É necessário acesso à galeria.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setImageLocalUri(asset.uri);
    setUploadingImage(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `news/${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error } = await (supabase as any).storage
        .from("news")
        .upload(path, blob, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });
      if (error) throw error;
      const { data } = (supabase as any).storage
        .from("news")
        .getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível fazer upload da imagem.");
      setImageLocalUri(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert("Erro", "Título obrigatório.");
    setSaving(true);
    try {
      const p = {
        title: title.trim(),
        content: content.trim() || undefined,
        category_name: categoryName.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        condominium_id: Number(condoId),
      };
      if (editing) await api.adminUpdateNews(editing.id, p);
      else await api.adminCreateNews(p);
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      logger.error(
        LogCategory.UI,
        "AdminNews: save failed",
        e instanceof Error ? e : new Error(String(e)),
      );
      Alert.alert("Erro", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (n: CondominiumNews) => {
    Alert.alert("Eliminar", `Eliminar "${n.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await api.adminDeleteNews(n.id);
          load();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.cardBackground,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Notícias</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput
          style={{ flex: 1, color: theme.text }}
          placeholder="Pesquisar..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText style={{ color: theme.textSecondary }}>
                Sem notícias
              </ThemedText>
            </View>
          }
          renderItem={({ item: n }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{n.title}</ThemedText>
                  {n.category_name && (
                    <View style={styles.catBadge}>
                      <ThemedText
                        type="small"
                        style={{
                          color: BrandColors.primary,
                          fontWeight: "700",
                        }}
                      >
                        {n.category_name}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    Condo #{n.condominium_id}
                  </ThemedText>
                </View>
                <Pressable onPress={() => openEdit(n)} style={styles.iconBtn}>
                  <Feather
                    name="edit-2"
                    size={16}
                    color={BrandColors.primary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(n)}
                  style={styles.iconBtn}
                >
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      <Pressable style={styles.fab} onPress={openCreate}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">
                {editing ? "Editar Notícia" : "Nova Notícia"}
              </ThemedText>
              <Pressable onPress={() => setModalOpen(false)}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}
            >
              {(
                [
                  ["Título *", title, setTitle],
                  ["Categoria", categoryName, setCategoryName],
                  ["Condo ID *", condoId, setCondoId],
                ] as [string, string, (t: string) => void][]
              ).map(([label, value, set]) => (
                <View key={label}>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary, marginBottom: 4 }}
                  >
                    {label}
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: theme.border,
                        color: theme.text,
                        backgroundColor: theme.backgroundSecondary,
                      },
                    ]}
                    value={value}
                    onChangeText={set}
                    keyboardType={
                      label.includes("ID") ? "number-pad" : "default"
                    }
                  />
                </View>
              ))}
              {/* Image picker */}
              <View>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary, marginBottom: 4 }}
                >
                  Imagem
                </ThemedText>
                <Pressable
                  onPress={pickImage}
                  disabled={uploadingImage}
                  style={[
                    styles.imagePicker,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundSecondary,
                    },
                  ]}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color={BrandColors.primary} />
                  ) : imageLocalUri || imageUrl ? (
                    <Image
                      source={{ uri: imageLocalUri ?? imageUrl }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Feather
                        name="image"
                        size={24}
                        color={theme.textSecondary}
                      />
                      <ThemedText
                        type="small"
                        style={{ color: theme.textSecondary, marginTop: 4 }}
                      >
                        Selecionar imagem
                      </ThemedText>
                    </>
                  )}
                </Pressable>
                {imageUrl ? (
                  <Pressable
                    onPress={() => {
                      setImageUrl("");
                      setImageLocalUri(null);
                    }}
                    style={{ marginTop: 4 }}
                  >
                    <ThemedText type="small" style={{ color: "#EF4444" }}>
                      Remover imagem
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <View>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary, marginBottom: 4 }}
                >
                  Conteúdo
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.backgroundSecondary,
                      minHeight: 100,
                      textAlignVertical: "top",
                    },
                  ]}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={4}
                />
              </View>
              <Pressable
                style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                    Guardar
                  </ThemedText>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    paddingTop: 56,
  },
  backBtn: { marginRight: Spacing.md },
  refreshBtn: { marginLeft: "auto" as never },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["3xl"],
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  catBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: BrandColors.primary + "15",
    marginTop: 2,
  },
  iconBtn: { padding: 4 },
  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: BrandColors.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  imagePicker: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    borderStyle: "dashed",
    minHeight: 100,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: 150 },
});
