import { forwardRef, type InputHTMLAttributes } from 'react';
import { PasswordInput } from '@/components/PasswordInput';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

/**
 * Labelled form field: label above the control, inline error below. Spreads through
 * input props so react-hook-form's `register()` works and forwards the ref. When
 * `type="password"`, delegates to the show/hide PasswordInput primitive.
 */
export const AuthField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, type, className = '', ...props }, ref) => {
    return (
      <div>
        <label className="label">{label}</label>
        {type === 'password' ? (
          <PasswordInput ref={ref} className={className} {...props} />
        ) : (
          <input ref={ref} type={type} className={`input ${className}`} {...props} />
        )}
        {error && <p className="mt-xs text-sm text-danger">{error}</p>}
      </div>
    );
  },
);

AuthField.displayName = 'AuthField';
