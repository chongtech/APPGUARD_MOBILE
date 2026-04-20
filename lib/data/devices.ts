import { callRpc, callRpcFirst } from "@/lib/data/rpc";
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
}): Promise<void> {
  await callRpc<void>("update_device_heartbeat", {
    p_identifier: params.deviceIdentifier,
  });
}

export async function getDeviceByIdentifier(
  deviceIdentifier: string,
): Promise<Device | null> {
  return callRpcFirst<Device>("get_device", {
    p_identifier: deviceIdentifier,
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
