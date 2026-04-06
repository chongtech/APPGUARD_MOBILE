import React, { useState, useRef } from "react";
import {
  View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
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
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";

export default function LoginScreen() {
  const { theme } = useTheme();
  const { login, isDeviceConfigured } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<import("@react-navigation/native").NavigationProp<{ Setup: undefined; Login: undefined }>>();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const lastNameRef = useRef<TextInput>(null);

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
      showToast("Erro ao iniciar sessão. Verifique a ligação.", "error");
      setPin("");
    } finally {
      setIsLoading(false);
    }
  }

  function handleResetDevice() {
    Alert.alert(
      "Redefinir Dispositivo",
      "Esta ação irá remover a configuração do dispositivo. Tem a certeza?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Redefinir",
          style: "destructive",
          onPress: async () => {
            const { api } = await import("@/services/dataService");
            await api.resetDevice();
            navigation.navigate("Setup");
          },
        },
      ]
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={[styles.logoContainer, { backgroundColor: BrandColors.primary + "15" }]}>
              <Feather name="shield" size={40} color={BrandColors.primary} />
            </View>
            <ThemedText type="h1" style={styles.title}>Bem-vindo</ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Introduza os seus dados para entrar
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText type="caption" style={[styles.label, { color: theme.textSecondary }]}>PRIMEIRO NOME</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
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
              <ThemedText type="caption" style={[styles.label, { color: theme.textSecondary }]}>APELIDO</ThemedText>
              <TextInput
                ref={lastNameRef}
                style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
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
            <ThemedText type="h4" style={styles.pinLabel}>PIN de Acesso</ThemedText>
            <PINPad value={pin} onValueChange={setPin} maxLength={6} />
          </View>

          <View style={styles.footer}>
            <Button onPress={handleLogin} disabled={isLoading || pin.length < 4} style={styles.loginButton}>
              {isLoading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : "Entrar"
              }
            </Button>

            <Pressable onPress={handleResetDevice} style={styles.resetButton}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Redefinir dispositivo
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: 80 },
  header: { alignItems: "center", marginBottom: Spacing["3xl"] },
  logoContainer: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: Spacing.lg },
  title: { marginBottom: Spacing.sm },
  subtitle: { textAlign: "center" },
  form: { gap: Spacing.md, marginBottom: Spacing["2xl"] },
  inputGroup: { gap: Spacing.xs },
  label: { letterSpacing: 0.5 },
  input: { height: Spacing.inputHeight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.lg, borderWidth: 1, fontSize: 16 },
  pinSection: { alignItems: "center", marginBottom: Spacing["3xl"] },
  pinLabel: { marginBottom: Spacing.lg },
  footer: { gap: Spacing.lg, paddingBottom: Spacing["4xl"] },
  loginButton: { width: "100%" },
  resetButton: { alignItems: "center", padding: Spacing.md },
});
