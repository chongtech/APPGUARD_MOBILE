import React, { useState, useEffect, useCallback } from "react";
import {
  View, StyleSheet, ScrollView, TextInput, Pressable,
  FlatList, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { Image } from "react-native";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { VisitTypeConfig, ServiceTypeConfig, Restaurant, Sport, Unit } from "@/types";
import { VisitStatus, ApprovalMode } from "@/types";
import type { GuardTabParamList } from "@/navigation/GuardTabNavigator";
import { CameraCapture } from "@/components/CameraCapture";
import { QRScanner } from "@/components/QRScanner";

type Nav = BottomTabNavigationProp<GuardTabParamList>;

// ─── Icon helper ──────────────────────────────────────────────────────────────

function VisitTypeIcon({ iconKey, name }: { iconKey?: string; name: string }) {
  const key = (iconKey ?? name).toLowerCase();
  if (key.includes("truck") || key.includes("entrega") || key.includes("delivery"))
    return <Feather name="truck" size={28} color={BrandColors.primary} />;
  if (key.includes("wrench") || key.includes("serviço") || key.includes("service"))
    return <Feather name="tool" size={28} color={BrandColors.primary} />;
  if (key.includes("restaurant") || key.includes("restaurante"))
    return <Feather name="coffee" size={28} color={BrandColors.primary} />;
  if (key.includes("sport") || key.includes("desporto"))
    return <Feather name="activity" size={28} color={BrandColors.primary} />;
  if (key.includes("graduation") || key.includes("aluno"))
    return <Feather name="book" size={28} color={BrandColors.primary} />;
  return <Feather name="user" size={28} color={BrandColors.primary} />;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NewEntryScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const navigation = useNavigation<Nav>();
  const [step, setStep] = useState<1 | 2>(1);

  // Config data
  const [visitTypes, setVisitTypes] = useState<VisitTypeConfig[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeConfig[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [configLoading, setConfigLoading] = useState(true);

  // Selected type
  const [selectedTypeConfig, setSelectedTypeConfig] = useState<VisitTypeConfig | null>(null);

  // Form state
  const [visitorName, setVisitorName] = useState("");
  const [visitorDoc, setVisitorDoc] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [unitId, setUnitId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [sportId, setSportId] = useState("");
  const [reason, setReason] = useState("");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(ApprovalMode.APP);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Picker & camera modals
  const [unitModal, setUnitModal] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const condoId = staff?.condominium_id;

  const loadConfig = useCallback(async () => {
    if (!condoId) return;
    setConfigLoading(true);
    const [vt, st, r, sp, u] = await Promise.all([
      api.getVisitTypes(),
      api.getServiceTypes(),
      api.getRestaurants(condoId),
      api.getSports(condoId),
      api.getUnitsWithResidents(condoId),
    ]);
    setVisitTypes(vt);
    setServiceTypes(st);
    setRestaurants(r);
    setSports(sp);
    setUnits(u);
    setConfigLoading(false);
  }, [condoId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const resetForm = () => {
    setStep(1);
    setSelectedTypeConfig(null);
    setVisitorName(""); setVisitorDoc(""); setVisitorPhone("");
    setVehiclePlate(""); setUnitId(""); setServiceTypeId("");
    setRestaurantId(""); setSportId(""); setReason("");
    setApprovalMode(ApprovalMode.APP);
  };

  const handleTypeSelect = (tc: VisitTypeConfig) => {
    setSelectedTypeConfig(tc);
    setStep(2);
  };

  const isFormValid = (): boolean => {
    if (!visitorName.trim()) return false;
    if (selectedTypeConfig?.requires_service_type && !serviceTypeId) return false;
    if (selectedTypeConfig?.requires_restaurant && !restaurantId) return false;
    if (selectedTypeConfig?.requires_sport && !sportId) return false;
    if (!selectedTypeConfig?.requires_restaurant && !selectedTypeConfig?.requires_sport && !unitId) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      Alert.alert("Campos obrigatórios", "Por favor preencha todos os campos obrigatórios.");
      return;
    }
    if (!staff) return;

    const isFreeEntry = selectedTypeConfig?.requires_restaurant || selectedTypeConfig?.requires_sport;

    setSubmitting(true);
    try {
      await api.createVisit({
        condominium_id: staff.condominium_id,
        visitor_name: visitorName.trim(),
        visitor_doc: visitorDoc || undefined,
        visitor_phone: visitorPhone || undefined,
        vehicle_license_plate: vehiclePlate || undefined,
        // visit_type_id is numeric in DB; selectedTypeConfig.id is UUID string — pass 0 and let backend resolve from visit_type name
        visit_type_id: 0,
        visit_type: selectedTypeConfig!.name,
        service_type_id: serviceTypeId ? Number(serviceTypeId) : undefined,
        restaurant_id: restaurantId || undefined,
        sport_id: sportId || undefined,
        unit_id: unitId ? Number(unitId) : undefined,
        reason: reason || undefined,
        photo_url: photoUri || undefined,
        approval_mode: isFreeEntry ? "ENTRADA_LIVRE" as ApprovalMode : approvalMode,
        status: isFreeEntry ? VisitStatus.APPROVED : VisitStatus.PENDING,
        guard_id: staff.id,
        check_in_at: new Date().toISOString(),
      });
      resetForm();
      navigation.navigate("DailyList");
    } catch (err) {
      Alert.alert("Erro", "Não foi possível registar a visita. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUnit = units.find((u) => String(u.id) === unitId);

  const filteredUnits = units.filter((u) => {
    const q = unitSearch.toLowerCase();
    return (
      u.number.toLowerCase().includes(q) ||
      u.code_block?.toLowerCase().includes(q) ||
      u.residents?.some((r) => r.name.toLowerCase().includes(q))
    );
  });

  // ── Step 1: Visit Type Selection ────────────────────────────────────────────

  const renderStep1 = () => (
    <ScrollView contentContainerStyle={styles.step1Grid}>
      {configLoading ? (
        <ActivityIndicator color={BrandColors.primary} style={{ marginTop: 60 }} />
      ) : visitTypes.length === 0 ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color={theme.textSecondary} />
          <ThemedText style={{ color: theme.textSecondary }}>Sem tipos de visita configurados.</ThemedText>
        </View>
      ) : (
        visitTypes.map((vt) => (
          <Pressable
            key={vt.id}
            style={({ pressed }) => [
              styles.typeCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => handleTypeSelect(vt)}
          >
            <View style={[styles.typeIcon, { backgroundColor: BrandColors.primary + "15" }]}>
              <VisitTypeIcon iconKey={vt.icon_key} name={vt.name} />
            </View>
            <ThemedText type="h4" style={{ textAlign: "center", textTransform: "uppercase", marginTop: Spacing.sm }}>
              {vt.name}
            </ThemedText>
          </Pressable>
        ))
      )}
    </ScrollView>
  );

  // ── Step 2: Visitor Details Form ────────────────────────────────────────────

  const renderStep2 = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.step2Content}>
        {/* Header */}
        <View style={styles.step2Header}>
          <Pressable onPress={() => setStep(1)} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">Detalhes: {selectedTypeConfig?.name}</ThemedText>
        </View>

        {/* Personal info */}
        <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          INFORMAÇÕES PESSOAIS
        </ThemedText>
        <View style={[styles.formCard, { backgroundColor: theme.cardBackground }]}>
          <FieldInput label="Nome Completo *" value={visitorName} onChangeText={setVisitorName} placeholder="Nome do visitante" theme={theme} />
          <FieldInput label="Documento (opcional)" value={visitorDoc} onChangeText={setVisitorDoc} placeholder="BI / Passaporte" theme={theme} />
          <FieldInput label="Telefone (opcional)" value={visitorPhone} onChangeText={setVisitorPhone} placeholder="+351 9XX XXX XXX" keyboardType="phone-pad" theme={theme} />
          <FieldInput label="Matrícula (opcional)" value={vehiclePlate} onChangeText={setVehiclePlate} placeholder="AA-00-AA" autoCapitalize="characters" theme={theme} />
        </View>

        {/* Unit selector (unless restaurant/sport) */}
        {!selectedTypeConfig?.requires_restaurant && !selectedTypeConfig?.requires_sport && (
          <>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              UNIDADE *
            </ThemedText>
            <Pressable
              style={[styles.pickerBtn, { backgroundColor: theme.cardBackground, borderColor: unitId ? BrandColors.primary : theme.border }]}
              onPress={() => setUnitModal(true)}
            >
              <Feather name="home" size={18} color={unitId ? BrandColors.primary : theme.textSecondary} />
              <ThemedText style={{ flex: 1, color: unitId ? theme.text : theme.textSecondary }}>
                {unitId
                  ? `Bloco ${selectedUnit?.code_block || ""} - ${selectedUnit?.number}`
                  : "Selecionar unidade..."}
              </ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          </>
        )}

        {/* Service type */}
        {selectedTypeConfig?.requires_service_type && (
          <>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>TIPO DE SERVIÇO *</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingBottom: 4 }}>
              {serviceTypes.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chipBtn, { backgroundColor: serviceTypeId === String(s.id) ? BrandColors.primary : theme.cardBackground, borderColor: serviceTypeId === String(s.id) ? BrandColors.primary : theme.border }]}
                  onPress={() => setServiceTypeId(String(s.id))}
                >
                  <ThemedText style={{ color: serviceTypeId === String(s.id) ? "#fff" : theme.text, fontWeight: "600" }}>
                    {s.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Restaurant */}
        {selectedTypeConfig?.requires_restaurant && (
          <>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>RESTAURANTE *</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingBottom: 4 }}>
              {restaurants.map((r) => (
                <Pressable
                  key={r.id}
                  style={[styles.chipBtn, { backgroundColor: restaurantId === String(r.id) ? BrandColors.primary : theme.cardBackground, borderColor: restaurantId === String(r.id) ? BrandColors.primary : theme.border }]}
                  onPress={() => setRestaurantId(String(r.id))}
                >
                  <ThemedText style={{ color: restaurantId === String(r.id) ? "#fff" : theme.text, fontWeight: "600" }}>
                    {r.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Sport */}
        {selectedTypeConfig?.requires_sport && (
          <>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>DESPORTO *</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingBottom: 4 }}>
              {sports.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chipBtn, { backgroundColor: sportId === String(s.id) ? BrandColors.primary : theme.cardBackground, borderColor: sportId === String(s.id) ? BrandColors.primary : theme.border }]}
                  onPress={() => setSportId(String(s.id))}
                >
                  <ThemedText style={{ color: sportId === String(s.id) ? "#fff" : theme.text, fontWeight: "600" }}>
                    {s.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Reason */}
        <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          MOTIVO (opcional)
        </ThemedText>
        <TextInput
          style={[styles.textarea, { backgroundColor: theme.cardBackground, color: theme.text, borderColor: theme.border }]}
          multiline
          numberOfLines={3}
          placeholder="Motivo da visita..."
          placeholderTextColor={theme.textSecondary}
          value={reason}
          onChangeText={setReason}
        />

        {/* Approval mode (only for standard visits) */}
        {!selectedTypeConfig?.requires_restaurant && !selectedTypeConfig?.requires_sport && (
          <>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              MODO DE APROVAÇÃO
            </ThemedText>
            <View style={[styles.formCard, { backgroundColor: theme.cardBackground, gap: Spacing.sm }]}>
              {[
                { mode: ApprovalMode.APP, label: "App do Morador", icon: "smartphone" },
                { mode: ApprovalMode.PHONE, label: "Chamada Telefónica", icon: "phone" },
                { mode: ApprovalMode.INTERCOM, label: "Intercomunicador", icon: "radio" },
                { mode: ApprovalMode.GUARD_MANUAL, label: "Autorização do Guarda", icon: "shield" },
              ].map(({ mode, label, icon }) => (
                <Pressable
                  key={mode}
                  style={[styles.radioRow, { borderColor: approvalMode === mode ? BrandColors.primary : theme.border }]}
                  onPress={() => setApprovalMode(mode)}
                >
                  <Feather name={icon as "smartphone"} size={18} color={approvalMode === mode ? BrandColors.primary : theme.textSecondary} />
                  <ThemedText style={{ flex: 1, color: approvalMode === mode ? theme.text : theme.textSecondary }}>
                    {label}
                  </ThemedText>
                  {approvalMode === mode && <Feather name="check-circle" size={18} color={BrandColors.primary} />}
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Photo capture */}
        <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          FOTO DO VISITANTE (opcional)
        </ThemedText>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Pressable onPress={() => setCameraOpen(true)}>
              <Image source={{ uri: photoUri }} style={styles.photoThumb} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.photoPlaceholder, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
              onPress={() => setCameraOpen(true)}
            >
              <Feather name="camera" size={24} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>Tirar Foto</ThemedText>
            </Pressable>
          )}
          <Pressable
            style={[styles.qrBtn, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => setQrOpen(true)}
          >
            <Feather name="maximize" size={22} color={BrandColors.primary} />
            <ThemedText type="small" style={{ color: BrandColors.primary, marginTop: 4, fontWeight: "700" }}>Scan QR</ThemedText>
          </Pressable>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, { backgroundColor: isFormValid() ? BrandColors.primary : theme.border, opacity: submitting ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={submitting || !isFormValid()}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <>
                <Feather name="save" size={20} color="#fff" />
                <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Registar Visita</ThemedText>
              </>}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <ThemedView style={styles.container}>
      {step === 1 ? renderStep1() : renderStep2()}

      <CameraCapture
        visible={cameraOpen}
        mode="photo"
        onCapture={(uri) => setPhotoUri(uri)}
        onClose={() => setCameraOpen(false)}
      />

      <QRScanner
        visible={qrOpen}
        onScan={(data) => {
          // Pre-fill visitor name or doc if QR contains JSON
          try {
            const parsed = JSON.parse(data) as { name?: string; doc?: string };
            if (parsed.name) setVisitorName(parsed.name);
            if (parsed.doc) setVisitorDoc(parsed.doc);
          } catch {
            setVisitorDoc(data);
          }
        }}
        onClose={() => setQrOpen(false)}
      />

      {/* Unit picker modal */}
      <Modal
        visible={unitModal}
        animationType="slide"
        transparent
        onRequestClose={() => setUnitModal(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">Selecionar Unidade</ThemedText>
              <Pressable onPress={() => setUnitModal(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Feather name="search" size={16} color={theme.textSecondary} />
              <TextInput
                style={{ flex: 1, color: theme.text, fontSize: 14 }}
                placeholder="Buscar por unidade ou morador..."
                placeholderTextColor={theme.textSecondary}
                value={unitSearch}
                onChangeText={setUnitSearch}
              />
            </View>
            <FlatList
              data={filteredUnits}
              keyExtractor={(u) => String(u.id)}
              contentContainerStyle={{ gap: 1 }}
              renderItem={({ item: u }) => (
                <Pressable
                  style={[styles.unitRow, { backgroundColor: unitId === String(u.id) ? BrandColors.primary + "15" : "transparent", borderBottomColor: theme.border }]}
                  onPress={() => { setUnitId(String(u.id)); setUnitModal(false); setUnitSearch(""); }}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="h4">
                      {u.code_block ? `Bloco ${u.code_block} - ` : ""}{u.number}
                    </ThemedText>
                    {u.residents && u.residents.length > 0 && (
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {u.residents.map((r) => r.name).join(", ")}
                      </ThemedText>
                    )}
                  </View>
                  {unitId === String(u.id) && <Feather name="check" size={18} color={BrandColors.primary} />}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.center}>
                  <ThemedText style={{ color: theme.textSecondary }}>Nenhuma unidade encontrada</ThemedText>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

// ─── FieldInput helper ────────────────────────────────────────────────────────

function FieldInput({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize, theme,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder: string; keyboardType?: TextInput["props"]["keyboardType"];
  autoCapitalize?: TextInput["props"]["autoCapitalize"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any;
}) {
  return (
    <View>
      <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600", marginBottom: 4 }}>
        {label}
      </ThemedText>
      <TextInput
        style={{
          borderWidth: 1, borderColor: theme.border, borderRadius: BorderRadius.xs,
          padding: Spacing.md, color: theme.text, fontSize: 15, backgroundColor: theme.backgroundSecondary,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, padding: Spacing["3xl"] },
  // Step 1
  step1Grid: { flexDirection: "row", flexWrap: "wrap", padding: Spacing.lg, gap: Spacing.md, justifyContent: "space-between" },
  typeCard: { width: "47%", borderRadius: BorderRadius.md, borderWidth: 2, padding: Spacing.xl, alignItems: "center" },
  typeIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
  // Step 2
  step2Content: { padding: Spacing.lg, gap: Spacing.md },
  step2Header: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.sm },
  backBtn: { padding: Spacing.xs },
  sectionLabel: { fontWeight: "700", letterSpacing: 0.5, marginTop: Spacing.sm },
  formCard: { borderRadius: BorderRadius.md, padding: Spacing.lg, gap: Spacing.md },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.sm, borderWidth: 1.5 },
  chipBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 99, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, minHeight: 80, textAlignVertical: "top", fontSize: 14 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.xs, borderWidth: 1 },
  photoRow: { flexDirection: "row", gap: Spacing.md },
  photoThumb: { width: 90, height: 90, borderRadius: BorderRadius.sm },
  photoPlaceholder: { width: 90, height: 90, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  qrBtn: { flex: 1, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderStyle: "dashed", justifyContent: "center", alignItems: "center", minHeight: 90 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, padding: Spacing.lg, borderRadius: BorderRadius.sm, marginTop: Spacing.md },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, margin: Spacing.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.xs, borderWidth: 1 },
  unitRow: { flexDirection: "row", alignItems: "center", padding: Spacing.lg, borderBottomWidth: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { height: "80%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, overflow: "hidden" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
});
