import React, { useRef, useState } from "react";
import {
  View, Pressable, StyleSheet, Modal, ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult, CameraType } from "expo-camera";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { BrandColors, BorderRadius, Spacing } from "@/constants/theme";

export type CaptureMode = "photo" | "qr";

interface Props {
  visible: boolean;
  mode: CaptureMode;
  onCapture?: (uri: string) => void;
  onScan?: (data: string) => void;
  onClose: () => void;
}

export function CameraCapture({ visible, mode, onCapture, onScan, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [capturing, setCapturing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const handlePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        onCapture?.(photo.uri);
        onClose();
      }
    } catch {
      // ignore camera errors
    } finally {
      setCapturing(false);
    }
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    onScan?.(data);
    onClose();
  };

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible animationType="slide">
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={styles.center}>
          <Feather name="camera-off" size={48} color="#94A3B8" />
          <ThemedText style={styles.permText}>Permissão de câmara necessária</ThemedText>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <ThemedText style={{ color: "#fff", fontWeight: "700" }}>Autorizar Câmara</ThemedText>
          </Pressable>
          <Pressable onPress={onClose} style={{ marginTop: Spacing.lg }}>
            <ThemedText style={{ color: "#94A3B8" }}>Cancelar</ThemedText>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={mode === "qr" ? { barcodeTypes: ["qr", "code128", "ean13"] } : undefined}
          onBarcodeScanned={mode === "qr" ? handleBarcodeScanned : undefined}
        >
          {/* Top controls */}
          <View style={styles.topBar}>
            <Pressable style={styles.iconBtn} onPress={onClose}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            {mode === "photo" && (
              <Pressable
                style={styles.iconBtn}
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
              >
                <Feather name="refresh-cw" size={22} color="#fff" />
              </Pressable>
            )}
          </View>

          {/* QR aiming overlay */}
          {mode === "qr" && (
            <View style={styles.qrOverlay}>
              <View style={styles.qrCornerTL} />
              <View style={styles.qrCornerTR} />
              <View style={styles.qrCornerBL} />
              <View style={styles.qrCornerBR} />
              <ThemedText style={styles.qrHint}>Aponte para o QR Code</ThemedText>
            </View>
          )}

          {/* Photo shutter */}
          {mode === "photo" && (
            <View style={styles.bottomBar}>
              <Pressable
                style={[styles.captureBtn, capturing && { opacity: 0.6 }]}
                onPress={handlePhoto}
                disabled={capturing}
              >
                {capturing
                  ? <ActivityIndicator color="#fff" />
                  : <View style={styles.captureInner} />}
              </Pressable>
            </View>
          )}
        </CameraView>
      </View>
    </Modal>
  );
}

const QR_SIZE = 220;
const CORNER = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: Spacing.md, padding: Spacing["3xl"], backgroundColor: "#0F172A",
  },
  permText: { marginTop: Spacing.md, textAlign: "center", color: "#fff" },
  permBtn: {
    marginTop: Spacing.lg, backgroundColor: BrandColors.primary,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.sm,
  },
  camera: { flex: 1 },
  topBar: {
    flexDirection: "row", justifyContent: "space-between",
    padding: Spacing.lg, paddingTop: 56,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center",
  },
  // QR overlay — centred frame with corner marks
  qrOverlay: {
    flex: 1, justifyContent: "center", alignItems: "center",
    position: "relative",
  },
  qrHint: {
    color: "#fff", fontSize: 14, fontWeight: "600",
    marginTop: QR_SIZE / 2 + 32, textAlign: "center",
  },
  qrCornerTL: {
    position: "absolute",
    top: "50%", left: "50%",
    marginTop: -QR_SIZE / 2, marginLeft: -QR_SIZE / 2,
    width: CORNER, height: CORNER,
    borderTopWidth: 3, borderLeftWidth: 3, borderColor: BrandColors.primary,
  },
  qrCornerTR: {
    position: "absolute",
    top: "50%", left: "50%",
    marginTop: -QR_SIZE / 2, marginLeft: QR_SIZE / 2 - CORNER,
    width: CORNER, height: CORNER,
    borderTopWidth: 3, borderRightWidth: 3, borderColor: BrandColors.primary,
  },
  qrCornerBL: {
    position: "absolute",
    top: "50%", left: "50%",
    marginTop: QR_SIZE / 2 - CORNER, marginLeft: -QR_SIZE / 2,
    width: CORNER, height: CORNER,
    borderBottomWidth: 3, borderLeftWidth: 3, borderColor: BrandColors.primary,
  },
  qrCornerBR: {
    position: "absolute",
    top: "50%", left: "50%",
    marginTop: QR_SIZE / 2 - CORNER, marginLeft: QR_SIZE / 2 - CORNER,
    width: CORNER, height: CORNER,
    borderBottomWidth: 3, borderRightWidth: 3, borderColor: BrandColors.primary,
  },
  // Photo capture
  bottomBar: { paddingBottom: 48, alignItems: "center" },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 3, borderColor: "#fff",
    justifyContent: "center", alignItems: "center",
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
});
