import { callRpc } from "@/lib/data/rpc";
import type { Staff, Condominium } from "@/types";

export interface StaffLoginResult {
  staff: Staff & { condominium: Condominium };
  pin_hash: string;
}

export async function verifyStaffLogin(
  firstName: string,
  lastName: string,
  condominiumId: number
): Promise<StaffLoginResult | null> {
  const result = await callRpc<StaffLoginResult | null>("verify_staff_login", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_condominium_id: condominiumId,
  });
  return result;
}

export async function getCondominiumList(): Promise<Condominium[]> {
  const result = await callRpc<Condominium[]>("get_condominiums", {});
  return result ?? [];
}
