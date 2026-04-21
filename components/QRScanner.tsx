import React from "react";
import { CameraCapture } from "@/components/CameraCapture";

interface Props {
  visible: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ visible, onScan, onClose }: Props) {
  return (
    <CameraCapture
      visible={visible}
      mode="qr"
      onScan={onScan}
      onClose={onClose}
    />
  );
}
