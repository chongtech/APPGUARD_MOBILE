import { callRpc, callRpcFirst } from "@/lib/data/rpc";
import type { Staff, Condominium } from "@/types";

export interface StaffLoginResult {
  id: number;
  first_name: string;
  last_name: string;
  condominium_id: number;
  role: Staff["role"];
  condominium?: Condominium;
}

export async function verifyStaffLogin(
  firstName: string,
  lastName: string,
  pin: string,
): Promise<StaffLoginResult | null> {
  const result = await callRpc<StaffLoginResult | null>("verify_staff_login", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_pin: pin,
  });
  return result;
}

export async function getCondominiumList(): Promise<Condominium[]> {
  const result = await callRpc<Condominium[]>("get_condominiums", {});
  return result ?? [];
}

export async function getCondominiumById(
  condominiumId: number,
): Promise<Condominium | null> {
  return callRpcFirst<Condominium>("get_condominium", {
    p_id: condominiumId,
  });
}
