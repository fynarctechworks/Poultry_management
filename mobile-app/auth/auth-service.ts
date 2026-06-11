import { supabase } from '../lib/supabase';
import { getDeviceHash, getDeviceName } from '../lib/device';
import { track, FUNNEL } from '../lib/analytics';

// =============================================================================
// PoultryOS Auth Service — OTP-primary (MSG91 via Supabase phone auth),
// email/password fallback, account creation, and security-audit logging.
//
// OTP delivery is Supabase-native: Supabase generates the OTP and calls the
// `msg91-send-sms` Send-SMS hook to deliver it through MSG91. No custom backend.
// =============================================================================

// E.164 normaliser for Indian numbers: accepts "9876543210", "09876543210",
// "+919876543210" → "+919876543210".
export function toE164(input: string, defaultCountry = '91'): string {
  const digits = input.replace(/[^\d]/g, '');
  if (input.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${defaultCountry}${digits.slice(1)}`;
  if (digits.length > 10) return `+${digits}`;
  return `+${defaultCountry}${digits}`;
}

export function isValidIndianMobile(input: string): boolean {
  const e164 = toE164(input);
  return /^\+91[6-9]\d{9}$/.test(e164);
}

// ─── Mobile OTP (PRIMARY) ─────────────────────────────────────────────────────

/** Send an OTP to a phone number. Supabase creates the user if shouldCreateUser. */
export async function sendOtp(phone: string, shouldCreateUser = true) {
  const e164 = toE164(phone);
  const { data, error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser },
  });
  if (error) throw error;
  return { ...data, phone: e164 };
}

/** Verify the SMS OTP. On success Supabase returns a session (logs the user in). */
export async function verifyOtp(phone: string, token: string) {
  const e164 = toE164(phone);
  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token,
    type: 'sms',
  });
  if (error) throw error;
  // Stamp phone verification on our profile (Supabase tracks its own
  // phone_confirmed_at; we mirror it for the security screen + 7-day rule).
  const uid = data.user?.id;
  if (uid) {
    await supabase
      .from('profiles')
      .update({ phone_verified_at: new Date().toISOString() })
      .eq('id', uid)
      .then(() => {}, () => {});
  }
  await logAuthEvent('otp_verified', { phone: e164 }).catch(() => {});
  void track(FUNNEL.OTP_VERIFIED, { channel: 'sms' });
  return data;
}

// ─── Email / Password (FALLBACK) ──────────────────────────────────────────────

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await logAuthEvent('login_success', { method: 'password' }).catch(() => {});
  return data;
}

export interface RegisterParams {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

/**
 * Create an account with email/password. The `handle_new_user` DB trigger
 * creates the profile row — we no longer insert it client-side (fixes the
 * half-succeed bug). full_name is passed as user metadata for the trigger.
 */
export async function register({ email, password, fullName, phone }: RegisterParams) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    phone: phone ? toE164(phone) : undefined,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

// ─── 2FA (TOTP via Supabase MFA) ──────────────────────────────────────────────

/** Begin TOTP enrolment — returns a QR/secret to show the user. */
export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error) throw error;
  return data; // { id, totp: { qr_code, secret, uri } }
}

/** Confirm TOTP enrolment with the first 6-digit code from the authenticator. */
export async function verifyTotpEnrollment(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (error) throw error;
  await supabase.from('profiles').update({ two_factor_method: 'totp' }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
  await logAuthEvent('2fa_enabled', { method: 'totp' }).catch(() => {});
  return data;
}

export async function unenrollTotp(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (uid) await supabase.from('profiles').update({ two_factor_method: 'disabled' }).eq('id', uid);
  await logAuthEvent('2fa_disabled', {}).catch(() => {});
}

/** List the user's enrolled MFA factors. Returns the first verified TOTP factor id (if any). */
export async function getTotpFactor(): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totp = data?.totp?.[0];
  return totp ? { id: totp.id, status: totp.status } : null;
}

// ─── Security preferences (profiles) ──────────────────────────────────────────

export type TwoFactorMethod = 'disabled' | 'sms' | 'email' | 'totp';

export interface SecurityProfile {
  two_factor_method: TwoFactorMethod;
  phone_verified_at: string | null;
  email_verified_at: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
}

export async function getSecurityProfile(): Promise<SecurityProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('two_factor_method, phone_verified_at, email_verified_at, phone, whatsapp_phone')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as SecurityProfile) ?? null;
}

/** Set the preferred 2FA delivery method. TOTP additionally requires enrolment. */
export async function setTwoFactorMethod(method: TwoFactorMethod) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ two_factor_method: method, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) throw error;
  await logAuthEvent(method === 'disabled' ? '2fa_disabled' : '2fa_method_changed', { method }).catch(() => {});
}

// ─── Trusted devices ──────────────────────────────────────────────────────────

export interface TrustedDevice {
  id: string;
  device_hash: string;
  device_name: string | null;
  last_ip: string | null;
  trusted_until: string;
  created_at: string;
}

export async function listTrustedDevices(): Promise<TrustedDevice[]> {
  const { data, error } = await supabase
    .from('trusted_devices')
    .select('id, device_hash, device_name, last_ip, trusted_until, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as TrustedDevice[]) ?? [];
}

/** Remember the current device for `days` (default 30) — "don't ask for OTP again". */
export async function trustThisDevice(days = 30): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const deviceHash = await getDeviceHash();
  const trustedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('trusted_devices')
    .upsert(
      {
        user_id: user.id,
        device_hash: deviceHash,
        device_name: getDeviceName(),
        trusted_until: trustedUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_hash' },
    );
  if (error) throw error;
  await logAuthEvent('device_trusted', { device_name: getDeviceName() }, deviceHash).catch(() => {});
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  const { error } = await supabase.from('trusted_devices').delete().eq('id', id);
  if (error) throw error;
  await logAuthEvent('device_revoked', { device_id: id }).catch(() => {});
}

/** True if the current device is currently trusted (within its window). */
export async function isThisDeviceTrusted(): Promise<boolean> {
  const deviceHash = await getDeviceHash();
  const { data, error } = await supabase
    .from('trusted_devices')
    .select('trusted_until')
    .eq('device_hash', deviceHash)
    .gt('trusted_until', new Date().toISOString())
    .maybeSingle();
  if (error) return false;
  return !!data;
}

// ─── Login history (audit trail) ──────────────────────────────────────────────

export interface AuthAuditEvent {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  device_hash: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export async function listAuthAuditEvents(limit = 50): Promise<AuthAuditEvent[]> {
  const { data, error } = await supabase
    .from('auth_audit_events')
    .select('id, event_type, ip_address, user_agent, device_hash, metadata_json, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AuthAuditEvent[]) ?? [];
}

// ─── Session / audit ──────────────────────────────────────────────────────────

export async function logout() {
  await logAuthEvent('logout', {}).catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/** Record a security/login event via the tenant-resolving DB RPC. Best-effort. */
export async function logAuthEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
  deviceHash?: string,
) {
  const { error } = await supabase.rpc('log_auth_event', {
    p_event_type: eventType,
    p_metadata: metadata,
    p_device_hash: deviceHash ?? null,
  });
  if (error) throw error;
}
