import "server-only";
import {
  parseSupabaseEnvironment,
  type SupabaseEnvironment,
} from "@/lib/env-validation";

export function getSupabaseEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseEnvironment {
  return parseSupabaseEnvironment(env);
}
