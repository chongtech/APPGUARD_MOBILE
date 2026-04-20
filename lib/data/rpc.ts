import { supabase } from "@/lib/supabase";
import { logger, LogCategory } from "@/services/logger";

export type RpcParams = Record<string, unknown> | undefined;

export async function callRpc<T>(fn: string, params?: RpcParams): Promise<T> {
  logger.debug(LogCategory.RPC, `Call: ${fn}`);
  if (typeof (supabase as { rpc?: unknown }).rpc !== "function") {
    const error = new Error(
      "Supabase RPC client unavailable. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
    logger.error(LogCategory.RPC, `Failed: ${fn}`, error);
    throw error;
  }
  const { data, error } = await supabase.rpc(fn, (params ?? {}) as any);
  if (error) {
    const wrappedError =
      error instanceof Error
        ? error
        : Object.assign(
            new Error(
              (error as { message?: string }).message || JSON.stringify(error),
            ),
            {
              code: (error as { code?: string }).code,
              details: (error as { details?: string }).details,
              hint: (error as { hint?: string }).hint,
            },
          );
    logger.error(LogCategory.RPC, `Failed: ${fn}`, wrappedError);
    throw wrappedError;
  }
  logger.debug(LogCategory.RPC, `Success: ${fn}`);
  return data as T;
}

export async function callRpcFirst<T>(
  fn: string,
  params?: RpcParams,
): Promise<T | null> {
  const data = await callRpc<T | T[] | null>(fn, params);
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data ?? null;
}
