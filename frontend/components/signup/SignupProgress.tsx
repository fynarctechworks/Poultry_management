import { Check } from 'lucide-react';

/**
 * The 7-step signup journey rail (PRD "required user journey"). Shared across
 * the register page, the email-verify page, and the onboarding wizard so the
 * user always sees current / completed / remaining steps. Keyed to DESIGN.md
 * tokens via the project utility classes.
 */
export const SIGNUP_STEPS = [
  'Account',
  'Email verification',
  'Farm details',
  'Farm type',
  'Subscription plan',
  'Billing & payment',
  'Complete',
] as const;

export type SignupStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * `light` — dark text on a card (default, e.g. the register page).
 * `dark`  — white text over the Silk brand panel (onboarding split-screen).
 */
export function SignupProgress({
  current,
  variant = 'light',
}: {
  current: SignupStepIndex;
  variant?: 'light' | 'dark';
}) {
  const dark = variant === 'dark';
  return (
    <ol className="space-y-1">
      {SIGNUP_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const badge = dark
          ? done
            ? 'bg-success text-on-primary'
            : active
              ? 'bg-white text-primary'
              : 'bg-white/15 text-white/70'
          : done
            ? 'bg-success text-on-primary'
            : active
              ? 'bg-primary text-on-primary'
              : 'bg-mute-soft text-body-soft';
        const text = dark
          ? active
            ? 'font-semibold text-white'
            : done
              ? 'text-white/85'
              : 'text-white/55'
          : active
            ? 'font-semibold text-ink'
            : done
              ? 'text-body'
              : 'text-body-soft';
        return (
          <li key={label} className="flex items-center gap-sm py-1.5">
            <span
              className={['grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', badge].join(' ')}
              aria-hidden
            >
              {done ? <Check size={13} /> : i + 1}
            </span>
            <span className={['text-sm', text].join(' ')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
