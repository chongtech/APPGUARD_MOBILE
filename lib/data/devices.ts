import { callRpc } from "@/lib/data/rpc";
import type { Device } from "@/types";

export async function registerDevice(params: {
  deviceIdentifier: string;
  deviceName: string;
  condominiumId: number;
  metadata: Record<string, unknown>;
}): Promise<Device> {
  return callRpc<Device>("register_device", {
    p_data: {
      device_identifier: params.deviceIdentifier,
      device_name: params.deviceName,
      condominium_id: params.condominiumId,
      configured_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      status: "ACTIVE",
      metadata: params.metadata,
    },
  });
}

export async function updateDeviceHeartbeat(params: {
  deviceIdentifier: string;
  condominiumId: number;
}): Promise<void> {
  await callRpc<void>("update_device_heartbeat", {
    p_device_identifier: params.deviceIdentifier,
    p_condominium_id: params.condominiumId,
  });
}

export async function getDeviceByIdentifier(
  deviceIdentifier: string,
): Promise<Device | null> {
  return callRpc<Device | null>("get_device_by_identifier", {
    p_device_identifier: deviceIdentifier,
  });
}

export async function setCondoVisitorPhotoSetting(
  condoId: number,
  enabled: boolean,
): Promise<void> {
  await callRpc<void>("set_condo_visitor_photo_setting", {
    p_condo_id: condoId,
    p_enabled: enabled,
  });
}
