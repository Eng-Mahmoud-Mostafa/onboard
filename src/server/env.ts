import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
