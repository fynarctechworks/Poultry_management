import { redirect } from 'next/navigation';

// The Control Center is rooted at /admin. Send the bare root there;
// the /admin layout enforces the platform-admin gate.
export default function Root() {
  redirect('/admin');
}
