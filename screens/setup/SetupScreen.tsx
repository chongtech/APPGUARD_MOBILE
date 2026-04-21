import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useNetInfo } from "@/hooks/useNetInfo";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { getDeviceIdentifier, getDeviceName } from "@/services/deviceUtils";
import type { RecoveryDevice } from "@/lib/data/devices";
import { logger, LogCategory } from "@/services/logger";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { Condominium } from "@/types";
import type { AuthStackParamList } from "@/navigation/AuthNavigator";

type NavProp = NativeStackNavigationProp<AuthStackParamList, "Setup">;

type SetupModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

function SetupModal({ visible, onRequestClose, children }: SetupModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View style={styles.modalCard}>{children}</View>
      </View>
    </Modal>
  );
}

type ModalActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
};

function ModalAction({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  loading = false,
}: ModalActionProps) {
  const backgroundColor =
    variant === "danger"
      ? "#DC2626"
      : variant === "secondary"
        ? "#F1F5F9"
        : BrandColors.primary;
  const textColor = variant === "secondary" ? "#475569" : "#FFFFFF";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.modalAction,
        { backgroundColor, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <ThemedText style={[styles.modalActionText, { color: textColor }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export default function SetupScreen() {
  const { theme } = useTheme();
  const { isOnline } = useNetInfo();
  const { refreshSession } = useAuth();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [selected, setSelected] = useState<Condominium | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visitorPhotoEnabled, setVisitorPhotoEnabled] = useState(true);
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [setupError, setSetupError] = useState("");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showOfflineConfig, setShowOfflineConfig] = useState(false);

  const [replaceAdminName, setReplaceAdminName] = useState("");
  const [replaceAdminPin, setReplaceAdminPin] = useState("");
  const [replaceError, setReplaceError] = useState("");

  const [activeDevices, setActiveDevices] = useState<RecoveryDevice[]>([]);
  const [selectedRecoveryDevice, setSelectedRecoveryDevice] =
    useState<RecoveryDevice | null>(null);
  const [recoveryAdminName, setRecoveryAdminName] = useState("");
  const [recoveryAdminPin, setRecoveryAdminPin] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const [offlineCondoId, setOfflineCondoId] = useState("");
  const [offlineCondoName, setOfflineCondoName] = useState("");
  const [offlineError, setOfflineError] = useState("");

  const loadCondominiums = useCallback(async () => {
    setIsLoading(true);
    setSetupError("");
    try {
      await api.init();
      const list = await api.getAvailableCondominiums();
      setCondominiums(list);
      setSelected((current) =>
        current
          ? (list.find((item) => item.id === current.id) ?? null)
          : current,
      );
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: loadCondominiums failed",
        error,
      );
      setSetupError(
        "Não foi possível carregar os condomínios. Verifique a ligação.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCondominiums();
    getDeviceIdentifier()
      .then(setDeviceIdentifier)
      .catch(() => {});
  }, [loadCondominiums]);

  useEffect(() => {
    if (!isOnline) {
      setShowConfirmModal(false);
      setShowReplaceModal(false);
      setShowRecoveryModal(false);
    }
  }, [isOnline]);

  async function completeSetup() {
    await refreshSession();
    navigation.navigate("Login");
  }

  async function handleConfigure() {
    if (!selected) return;

    setIsConfiguring(true);
    setSetupError("");

    try {
      const result = await api.configureDevice(
        selected.id,
        visitorPhotoEnabled,
      );
      if (result.success) {
        setShowConfirmModal(false);
        await completeSetup();
        return;
      }

      if (result.existingDevices?.length) {
        setShowConfirmModal(false);
        setReplaceError(result.error ?? "");
        setShowReplaceModal(true);
        return;
      }

      setSetupError(
        result.error ?? "Não foi possível configurar o dispositivo.",
      );
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: handleConfigure failed",
        error,
      );
      setSetupError("Não foi possível configurar o dispositivo.");
    } finally {
      setIsConfiguring(false);
    }
  }

  async function handleReplaceDevice() {
    if (!selected) return;
    if (!replaceAdminName.trim() || !replaceAdminPin.trim()) {
      setReplaceError("Preencha o nome completo e o PIN do administrador.");
      return;
    }

    setIsConfiguring(true);
    setReplaceError("");
    try {
      const result = await api.forceConfigureDevice(
        selected.id,
        replaceAdminName,
        replaceAdminPin,
        visitorPhotoEnabled,
      );

      if (result.success) {
        setShowReplaceModal(false);
        await completeSetup();
        return;
      }

      setReplaceError(
        result.error ?? "Não foi possível substituir o dispositivo.",
      );
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: handleReplaceDevice failed",
        error,
      );
      setReplaceError("Não foi possível substituir o dispositivo.");
    } finally {
      setIsConfiguring(false);
    }
  }

  async function handleShowRecovery() {
    setShowRecoveryModal(true);
    setLoadingDevices(true);
    setRecoveryError("");
    setSelectedRecoveryDevice(null);

    try {
      const devices = await api.getAllActiveDevicesForRecovery();
      setActiveDevices(devices);
      if (devices.length === 0) {
        setRecoveryError("Nenhum dispositivo ativo encontrado.");
      }
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: getAllActiveDevicesForRecovery failed",
        error,
      );
      setRecoveryError("Não foi possível carregar os dispositivos.");
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleRecoverDevice() {
    if (!selectedRecoveryDevice) return;
    if (!recoveryAdminName.trim() || !recoveryAdminPin.trim()) {
      setRecoveryError("Preencha o nome completo e o PIN do administrador.");
      return;
    }

    setIsRecovering(true);
    setRecoveryError("");
    try {
      const result = await api.recoverDeviceConfiguration(
        selectedRecoveryDevice.device_identifier,
        recoveryAdminName,
        recoveryAdminPin,
      );

      if (result.success) {
        setShowRecoveryModal(false);
        await completeSetup();
        return;
      }

      setRecoveryError(
        result.error ?? "Não foi possível recuperar o dispositivo.",
      );
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: recoverDeviceConfiguration failed",
        error,
      );
      setRecoveryError("Não foi possível recuperar o dispositivo.");
    } finally {
      setIsRecovering(false);
    }
  }

  async function handleOfflineConfiguration() {
    const condominiumId = parseInt(offlineCondoId, 10);
    if (Number.isNaN(condominiumId) || condominiumId <= 0) {
      setOfflineError("ID do condomínio inválido.");
      return;
    }

    if (!offlineCondoName.trim()) {
      setOfflineError("Nome do condomínio é obrigatório.");
      return;
    }

    setIsConfiguring(true);
    setOfflineError("");
    try {
      const result = await api.configureDeviceOffline(
        condominiumId,
        offlineCondoName,
        visitorPhotoEnabled,
      );

      if (result.success) {
        await completeSetup();
        return;
      }

      setOfflineError(
        result.error ?? "Não foi possível configurar o dispositivo offline.",
      );
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "SetupScreen: configureDeviceOffline failed",
        error,
      );
      setOfflineError("Não foi possível configurar o dispositivo offline.");
    } finally {
      setIsConfiguring(false);
    }
  }

  function closeReplaceModal() {
    setShowReplaceModal(false);
    setReplaceAdminName("");
    setReplaceAdminPin("");
    setReplaceError("");
  }

  function closeRecoveryModal() {
    setShowRecoveryModal(false);
    setSelectedRecoveryDevice(null);
    setRecoveryAdminName("");
    setRecoveryAdminPin("");
    setRecoveryError("");
    setActiveDevices([]);
  }

  function renderPhotoToggle() {
    return (
      <View
        style={[
          styles.photoToggleContainer,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.photoToggleHeader}>
          <Feather name="camera" size={16} color={theme.textSecondary} />
          <ThemedText type="h4" style={{ flex: 1 }}>
            Captura de foto do visitante
          </ThemedText>
        </View>
        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
        >
          Quando ativado, o guarda é obrigado a fotografar o visitante antes de
          registar a entrada.
        </ThemedText>
        <View style={styles.photoToggleButtons}>
          <Pressable
            onPress={() => setVisitorPhotoEnabled(true)}
            style={[
              styles.photoToggleBtn,
              visitorPhotoEnabled
                ? {
                    backgroundColor: BrandColors.primary,
                    borderColor: BrandColors.primary,
                  }
                : {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
            ]}
          >
            <ThemedText
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: visitorPhotoEnabled ? "#FFFFFF" : theme.textSecondary,
              }}
            >
              Sim, obrigatório
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setVisitorPhotoEnabled(false)}
            style={[
              styles.photoToggleBtn,
              !visitorPhotoEnabled
                ? {
                    backgroundColor: theme.textSecondary,
                    borderColor: theme.textSecondary,
                  }
                : {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
            ]}
          >
            <ThemedText
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: !visitorPhotoEnabled ? "#FFFFFF" : theme.textSecondary,
              }}
            >
              Não, ignorar
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  const filteredCondominiums = condominiums.filter((condominium) =>
    condominium.name.toLowerCase().includes(searchQuery.toLowerCase()),
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
            {item.address ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.address}
              </ThemedText>
            ) : null}
          </View>
          {isSelected ? (
            <Feather
              name="check-circle"
              size={24}
              color={BrandColors.primary}
            />
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (!isOnline) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.offlineScroll,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.logoContainer,
                { backgroundColor: BrandColors.primary + "15" },
              ]}
            >
              <Feather name="wifi-off" size={48} color={BrandColors.primary} />
            </View>
            <ThemedText type="h1" style={styles.title}>
              Dispositivo Não Configurado
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Este dispositivo não está configurado e não há ligação à internet.
            </ThemedText>
          </View>

          {!showOfflineConfig ? (
            <View
              style={[
                styles.offlineInfoCard,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
            >
              <ThemedText type="h4" style={styles.offlineTitle}>
                Instruções
              </ThemedText>
              <ThemedText style={styles.offlineStep}>
                1. Contacte o administrador da aplicação.
              </ThemedText>
              <ThemedText style={styles.offlineStep}>
                2. Informe o identificador deste tablet:
              </ThemedText>
              <View
                style={[
                  styles.deviceIdBox,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText selectable type="small">
                  {deviceIdentifier || getDeviceName()}
                </ThemedText>
              </View>
              <ThemedText style={styles.offlineStep}>
                3. O administrador deve fornecer o ID e o nome do condomínio.
              </ThemedText>
              <ThemedText style={styles.offlineStep}>
                4. Use a configuração manual abaixo para restaurar o tablet.
              </ThemedText>

              <View style={styles.offlineActions}>
                <Button onPress={loadCondominiums} style={styles.offlineButton}>
                  Tentar novamente
                </Button>
                <Button
                  onPress={() => setShowOfflineConfig(true)}
                  style={styles.offlineButton}
                >
                  Configuração Manual
                </Button>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.offlineForm,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
            >
              <ThemedText type="h3" style={styles.offlineTitle}>
                Configuração Manual
              </ThemedText>
              <View style={styles.inputGroup}>
                <ThemedText
                  type="caption"
                  style={[styles.label, { color: theme.textSecondary }]}
                >
                  ID DO CONDOMÍNIO
                </ThemedText>
                <TextInput
                  value={offlineCondoId}
                  onChangeText={setOfflineCondoId}
                  keyboardType="number-pad"
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Ex: 123"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <ThemedText
                  type="caption"
                  style={[styles.label, { color: theme.textSecondary }]}
                >
                  NOME DO CONDOMÍNIO
                </ThemedText>
                <TextInput
                  value={offlineCondoName}
                  onChangeText={setOfflineCondoName}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Ex: Condomínio Elite"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>

              {renderPhotoToggle()}

              {offlineError ? (
                <ThemedText style={styles.errorText}>{offlineError}</ThemedText>
              ) : null}

              <View style={styles.offlineActions}>
                <Button
                  onPress={() => setShowOfflineConfig(false)}
                  style={styles.offlineButton}
                >
                  Voltar
                </Button>
                <Button
                  onPress={handleOfflineConfiguration}
                  disabled={isConfiguring}
                  style={styles.offlineButton}
                >
                  {isConfiguring ? "A configurar..." : "Guardar Offline"}
                </Button>
              </View>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    );
  }

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

      {setupError ? (
        <View style={styles.errorBanner}>
          <ThemedText style={styles.errorBannerText}>{setupError}</ThemedText>
        </View>
      ) : null}

      {!isLoading && condominiums.length > 0 ? (
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
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={BrandColors.primary}
            style={styles.loader}
          />
        ) : filteredCondominiums.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="search" size={40} color={theme.textSecondary} />
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              {condominiums.length === 0
                ? "Nenhum condomínio disponível para configuração."
                : `Nenhum condomínio encontrado para "${searchQuery}"`}
            </ThemedText>
            <Button onPress={loadCondominiums} style={styles.retryButton}>
              Atualizar lista
            </Button>
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

      {selected ? renderPhotoToggle() : null}

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <Button
          onPress={() => setShowConfirmModal(true)}
          disabled={!selected || isConfiguring}
          style={styles.configureButton}
        >
          Configurar Dispositivo
        </Button>

        <Pressable onPress={handleShowRecovery} style={styles.recoveryTrigger}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Recuperar dispositivo existente
          </ThemedText>
        </Pressable>
      </View>

      <SetupModal
        visible={showConfirmModal && !!selected}
        onRequestClose={() => !isConfiguring && setShowConfirmModal(false)}
      >
        {selected ? (
          <>
            <View style={styles.modalIcon}>
              <Feather
                name="alert-circle"
                size={30}
                color={BrandColors.primary}
              />
            </View>
            <ThemedText type="h3" style={styles.modalTitle}>
              Confirmar dispositivo
            </ThemedText>
            <ThemedText
              style={[styles.modalText, { color: theme.textSecondary }]}
            >
              Este tablet será associado ao condomínio abaixo. Confirme antes de
              continuar.
            </ThemedText>
            <View
              style={[
                styles.modalSelection,
                {
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: theme.border,
                },
              ]}
            >
              <ThemedText type="h4">{selected.name}</ThemedText>
              {selected.address ? (
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary, marginTop: 4 }}
                >
                  {selected.address}
                </ThemedText>
              ) : null}
            </View>
            {renderPhotoToggle()}
            <View style={styles.modalActions}>
              <ModalAction
                label="Cancelar"
                onPress={() => setShowConfirmModal(false)}
                disabled={isConfiguring}
                variant="secondary"
              />
              <ModalAction
                label="Sim, configurar"
                onPress={handleConfigure}
                disabled={isConfiguring}
                loading={isConfiguring}
              />
            </View>
          </>
        ) : null}
      </SetupModal>

      <SetupModal
        visible={showReplaceModal && !!selected}
        onRequestClose={() => !isConfiguring && closeReplaceModal()}
      >
        <View style={styles.modalIcon}>
          <Feather name="refresh-cw" size={30} color="#DC2626" />
        </View>
        <ThemedText type="h3" style={styles.modalTitle}>
          Substituir dispositivo
        </ThemedText>
        <ThemedText style={[styles.modalText, { color: theme.textSecondary }]}>
          Este condomínio já tem um dispositivo ativo. Informe as credenciais de
          administrador para substituir o tablet anterior.
        </ThemedText>
        <View style={styles.inputGroup}>
          <ThemedText
            type="caption"
            style={[styles.label, { color: theme.textSecondary }]}
          >
            NOME DO ADMINISTRADOR
          </ThemedText>
          <TextInput
            value={replaceAdminName}
            onChangeText={setReplaceAdminName}
            style={[
              styles.input,
              {
                backgroundColor: theme.backgroundSecondary,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Ex: João Silva"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
        <View style={styles.inputGroup}>
          <ThemedText
            type="caption"
            style={[styles.label, { color: theme.textSecondary }]}
          >
            PIN DO ADMINISTRADOR
          </ThemedText>
          <TextInput
            value={replaceAdminPin}
            onChangeText={setReplaceAdminPin}
            style={[
              styles.input,
              {
                backgroundColor: theme.backgroundSecondary,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="PIN"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            keyboardType="number-pad"
          />
        </View>
        {replaceError ? (
          <ThemedText style={styles.errorText}>{replaceError}</ThemedText>
        ) : null}
        <View style={styles.modalActions}>
          <ModalAction
            label="Cancelar"
            onPress={closeReplaceModal}
            disabled={isConfiguring}
            variant="secondary"
          />
          <ModalAction
            label="Confirmar troca"
            onPress={handleReplaceDevice}
            disabled={isConfiguring}
            variant="danger"
            loading={isConfiguring}
          />
        </View>
      </SetupModal>

      <SetupModal
        visible={showRecoveryModal}
        onRequestClose={() => !isRecovering && closeRecoveryModal()}
      >
        <ThemedText type="h3" style={styles.modalTitle}>
          Recuperar dispositivo
        </ThemedText>
        <ThemedText style={[styles.modalText, { color: theme.textSecondary }]}>
          Selecione um dispositivo ativo e valide com credenciais de
          administrador.
        </ThemedText>
        <ScrollView style={styles.recoveryList} nestedScrollEnabled>
          {loadingDevices ? (
            <ActivityIndicator color={BrandColors.primary} size="large" />
          ) : activeDevices.length === 0 ? (
            <ThemedText
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              Nenhum dispositivo ativo encontrado.
            </ThemedText>
          ) : (
            activeDevices.map((device) => {
              const isSelected =
                selectedRecoveryDevice?.device_identifier ===
                device.device_identifier;
              return (
                <Pressable
                  key={device.device_identifier}
                  onPress={() => setSelectedRecoveryDevice(device)}
                  style={[
                    styles.recoveryDevice,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      borderColor: isSelected
                        ? BrandColors.primary
                        : theme.border,
                    },
                  ]}
                >
                  <ThemedText type="h4">
                    {device.device_name || "Dispositivo sem nome"}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary, marginTop: 2 }}
                  >
                    {device.condominium_name || "Sem condomínio"}
                  </ThemedText>
                  <ThemedText
                    type="caption"
                    style={{ color: theme.textSecondary, marginTop: 4 }}
                  >
                    {device.device_identifier}
                  </ThemedText>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {selectedRecoveryDevice ? (
          <>
            <View style={styles.inputGroup}>
              <ThemedText
                type="caption"
                style={[styles.label, { color: theme.textSecondary }]}
              >
                NOME DO ADMINISTRADOR
              </ThemedText>
              <TextInput
                value={recoveryAdminName}
                onChangeText={setRecoveryAdminName}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Ex: João Silva"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
            <View style={styles.inputGroup}>
              <ThemedText
                type="caption"
                style={[styles.label, { color: theme.textSecondary }]}
              >
                PIN DO ADMINISTRADOR
              </ThemedText>
              <TextInput
                value={recoveryAdminPin}
                onChangeText={setRecoveryAdminPin}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="PIN"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                keyboardType="number-pad"
              />
            </View>
          </>
        ) : null}

        {recoveryError ? (
          <ThemedText style={styles.errorText}>{recoveryError}</ThemedText>
        ) : null}

        <View style={styles.modalActions}>
          <ModalAction
            label="Cancelar"
            onPress={closeRecoveryModal}
            disabled={isRecovering}
            variant="secondary"
          />
          <ModalAction
            label="Recuperar"
            onPress={handleRecoverDevice}
            disabled={isRecovering || !selectedRecoveryDevice}
            loading={isRecovering}
          />
        </View>
      </SetupModal>
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
  errorBanner: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  errorBannerText: { color: "#B91C1C", textAlign: "center" },
  loader: { flex: 1 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  emptyText: { textAlign: "center", lineHeight: 22 },
  retryButton: { width: 220 },
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
  footer: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  configureButton: { width: "100%" },
  recoveryTrigger: { alignItems: "center", paddingVertical: Spacing.sm },
  photoToggleContainer: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  photoToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  photoToggleButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  photoToggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    borderRadius: BorderRadius.xl,
    backgroundColor: "#FFFFFF",
    padding: Spacing.xl,
    maxHeight: "85%",
  },
  modalIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: { textAlign: "center", marginBottom: Spacing.sm },
  modalText: { textAlign: "center", lineHeight: 22, marginBottom: Spacing.lg },
  modalSelection: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalAction: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalActionText: {
    fontWeight: "700",
    fontSize: 15,
  },
  inputGroup: { gap: Spacing.xs, marginBottom: Spacing.md },
  label: { letterSpacing: 0.5 },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    fontSize: 16,
  },
  errorText: {
    color: "#B91C1C",
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  recoveryList: {
    maxHeight: 220,
    marginBottom: Spacing.md,
  },
  recoveryDevice: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  offlineScroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 48,
  },
  offlineInfoCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  offlineForm: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  offlineTitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  offlineStep: {
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  deviceIdBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  offlineActions: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  offlineButton: {
    width: "100%",
  },
});
