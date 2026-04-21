import { callRpc, callRpcFirst } from "@/lib/data/rpc";
import { getCondominiumList } from "@/lib/data/auth";
import type { Device } from "@/types";

export type RecoveryDevice = Device & {
  condominium_name?: string;
};

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

export async function getActiveDevicesByCondominium(
  condominiumId: number,
  excludeDeviceIdentifier?: string,
): Promise<Device[]> {
  const devices = await callRpc<Device[]>("get_devices_by_condominium", {
    p_condominium_id: condominiumId,
  });

  return (devices ?? []).filter((device) => {
    if (device.status !== "ACTIVE") return false;
    if (!excludeDeviceIdentifier) return true;
    return device.device_identifier !== excludeDeviceIdentifier;
  });
}

export async function getAllActiveDevicesWithCondoInfo(): Promise<
  RecoveryDevice[]
> {
  const [devices, condominiums] = await Promise.all([
    callRpc<Device[]>("admin_get_all_devices", {}),
    getCondominiumList(),
  ]);

  const condoMap = new Map(
    (condominiums ?? []).map((condominium) => [
      condominium.id,
      condominium.name,
    ]),
  );

  return (devices ?? [])
    .filter((device) => device.status === "ACTIVE")
    .map((device) => ({
      ...device,
      condominium_name: device.condominium_id
        ? condoMap.get(device.condominium_id)
        : undefined,
    }));
}

export async function deactivateCondoDevices(
  condominiumId: number,
): Promise<boolean> {
  return callRpc<boolean>("deactivate_condo_devices", {
    p_condominium_id: condominiumId,
  });
}

export async function updateDeviceStatus(
  deviceId: number,
  status: "ACTIVE" | "INACTIVE" | "DECOMMISSIONED",
): Promise<Device | null> {
  return callRpcFirst<Device>("update_device_status", {
    p_id: deviceId,
    p_status: status,
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
