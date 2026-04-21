import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import PINPad from "@/components/PINPad";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { logger, LogCategory } from "@/services/logger";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";

export default function LoginScreen() {
  const { theme } = useTheme();
  const { login, refreshSession } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<
    import("@react-navigation/native").NavigationProp<{
      Setup: undefined;
      Login: undefined;
    }>
  >();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [masterPin, setMasterPin] = useState("");
  const lastNameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (tapCount === 0) return;
    const timer = setTimeout(() => setTapCount(0), 2000);
    return () => clearTimeout(timer);
  }, [tapCount]);

  async function handleLogin() {
    if (!firstName.trim() || !lastName.trim()) {
      showToast("Introduza o seu nome e apelido", "error");
      return;
    }
    if (pin.length < 4) {
      showToast("PIN deve ter pelo menos 4 dígitos", "error");
      return;
    }

    setIsLoading(true);
    try {
      const staff = await login(firstName, lastName, pin);
      if (!staff) {
        showToast("Credenciais inválidas. Tente novamente.", "error");
        setPin("");
      }
    } catch (error) {
      logger.error(LogCategory.AUTH, "LoginScreen: login failed", error);
      showToast("Erro ao iniciar sessão. Verifique a ligação.", "error");
      setPin("");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSecretTap() {
    setTapCount((current) => {
      const next = current + 1;
      if (next >= 5) {
        setShowResetModal(true);
        return 0;
      }
      return next;
    });
  }

  async function handleResetDevice() {
    if (masterPin !== "123456") {
      showToast("PIN mestre inválido", "error");
      setMasterPin("");
      return;
    }

    const { api } = await import("@/services/dataService");
    await api.resetDevice();
    setShowResetModal(false);
    setMasterPin("");
    await refreshSession();
    navigation.navigate("Setup");
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable
              onPress={handleSecretTap}
              style={[
                styles.logoContainer,
                { backgroundColor: BrandColors.primary + "15" },
              ]}
            >
              <Feather name="shield" size={40} color={BrandColors.primary} />
            </Pressable>
            <ThemedText type="h1" style={styles.title}>
              Bem-vindo
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Introduza os seus dados para entrar
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText
                type="caption"
                style={[styles.label, { color: theme.textSecondary }]}
              >
                PRIMEIRO NOME
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Ex: João"
                placeholderTextColor={theme.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText
                type="caption"
                style={[styles.label, { color: theme.textSecondary }]}
              >
                APELIDO
              </ThemedText>
              <TextInput
                ref={lastNameRef}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Ex: Silva"
                placeholderTextColor={theme.textSecondary}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={styles.pinSection}>
            <ThemedText type="h4" style={styles.pinLabel}>
              PIN de Acesso
            </ThemedText>
            <PINPad value={pin} onValueChange={setPin} maxLength={6} />
          </View>

          <View style={styles.footer}>
            <Button
              onPress={handleLogin}
              disabled={isLoading || pin.length < 4}
              style={styles.loginButton}
            >
              {isLoading ? "A entrar..." : "Entrar"}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowResetModal(false)}
          />
          <View style={styles.modalCard}>
            <ThemedText type="h3" style={styles.modalTitle}>
              Reset de Quiosque
            </ThemedText>
            <ThemedText
              style={[styles.modalText, { color: theme.textSecondary }]}
            >
              Introduza o PIN mestre para remover a configuração do dispositivo.
            </ThemedText>
            <TextInput
              value={masterPin}
              onChangeText={setMasterPin}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="PIN Mestre"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              keyboardType="number-pad"
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowResetModal(false);
                  setMasterPin("");
                }}
                style={[styles.modalButton, styles.secondaryButton]}
              >
                <ThemedText style={styles.secondaryButtonText}>
                  Cancelar
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleResetDevice();
                }}
                style={[styles.modalButton, styles.dangerButton]}
              >
                <ThemedText style={styles.dangerButtonText}>Resetar</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
  },
  header: { alignItems: "center", marginBottom: Spacing["3xl"] },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: { marginBottom: Spacing.sm },
  subtitle: { textAlign: "center" },
  form: { gap: Spacing.md, marginBottom: Spacing["2xl"] },
  inputGroup: { gap: Spacing.xs },
  label: { letterSpacing: 0.5 },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    fontSize: 16,
  },
  pinSection: { alignItems: "center", marginBottom: Spacing["3xl"] },
  pinLabel: { marginBottom: Spacing.lg },
  footer: { gap: Spacing.lg, paddingBottom: Spacing["4xl"] },
  loginButton: { width: "100%" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  modalText: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    backgroundColor: "#F1F5F9",
  },
  secondaryButtonText: {
    color: "#475569",
    fontWeight: "700",
  },
  dangerButton: {
    backgroundColor: "#DC2626",
  },
  dangerButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
