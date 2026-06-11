/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @poultryos/shared ships as TypeScript source (symlinked from packages/shared)
  transpilePackages: ['@poultryos/shared'],
  experimental: {
    typedRoutes: false,
  },
  async redirects() {
    // IA 2.0 route migration (audit/12-redesign-blueprint.md §1.5) —
    // old flat routes 301 to their consolidated homes so bookmarks survive.
    return [
      { source: '/team', destination: '/settings/team', permanent: true },
      { source: '/integrators', destination: '/settings/integrators', permanent: true },
      { source: '/whatsapp-settings', destination: '/settings/whatsapp', permanent: true },
      { source: '/billing', destination: '/settings/billing', permanent: true },
      { source: '/farms', destination: '/settings/farm', permanent: true },
      { source: '/sheds', destination: '/settings/farm', permanent: true },
      { source: '/vaccinations', destination: '/health?tab=vaccinations', permanent: true },
      { source: '/khata/aging', destination: '/khata?view=aging', permanent: true },
    ];
  },
  // Mirror the non-prefixed Supabase vars from .env.local into the client bundle
  // so user can keep one shared key naming with the Expo mobile app.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  },
};

export default nextConfig;
