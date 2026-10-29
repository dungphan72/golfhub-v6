import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PayosConfiguration = {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

export function getPayosConfiguration(): PayosConfiguration | null {
  const values = {
    clientId: process.env.PAYOS_CLIENT_ID?.trim(),
    apiKey: process.env.PAYOS_API_KEY?.trim(),
    checksumKey: process.env.PAYOS_CHECKSUM_KEY?.trim(),
    supabaseUrl: process.env.SUPABASE_URL?.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
  const configuredValues = Object.values(values).filter(
    (value): value is string => value !== undefined && value.length > 0,
  ).length;

  if (configuredValues === 0) return null;
  if (configuredValues !== Object.keys(values).length) {
    throw new Error(
      "PayOS configuration is incomplete. Set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const { clientId, apiKey, checksumKey, supabaseUrl, serviceRoleKey } = values;
  if (!clientId || !apiKey || !checksumKey || !supabaseUrl || !serviceRoleKey) {
    throw new Error("PayOS configuration is incomplete.");
  }

  return {
    clientId,
    apiKey,
    checksumKey,
    supabaseUrl,
    serviceRoleKey,
  };
}

export function createPayosServiceClient(
  configuration: PayosConfiguration,
): SupabaseClient {
  return createClient(
    configuration.supabaseUrl,
    configuration.serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
