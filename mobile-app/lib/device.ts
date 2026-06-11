// PoultryOS — stable per-install device identity.
//
// Used by the trusted-devices / "remember this device for 30 days" flow.
// We never send a hardware identifier to the server. Instead we mint a
// random opaque id on first use, persist it (SecureStore on native, a
// localStorage-backed key on web), and hash-name the device for display.
//
// The `device_hash` column on `trusted_devices` / `auth_audit_events`
// stores this opaque id, so revoking a device simply deletes the row.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'poultryos.device_id';

/** RFC4122-ish v4 id without pulling in a crypto polyfill. */
function randomId(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback: timestamp + random — collision-safe enough for a device tag.
  return 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function readStored(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return await AsyncStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStored(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') await AsyncStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Non-fatal — a fresh id will be minted next launch.
  }
}

/** Returns the persistent opaque device id, creating one on first call. */
export async function getDeviceHash(): Promise<string> {
  const existing = await readStored(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = randomId();
  await writeStored(DEVICE_ID_KEY, fresh);
  return fresh;
}

/** Human-readable label shown in the trusted-devices list, e.g. "Android phone". */
export function getDeviceName(): string {
  switch (Platform.OS) {
    case 'android':
      return 'Android phone';
    case 'ios':
      return 'iPhone / iPad';
    case 'web':
      return 'Web browser';
    default:
      return 'This device';
  }
}
