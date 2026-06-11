'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  phone: z.string().regex(/^\+91[0-9]{10}$/, 'Format: +91XXXXXXXXXX'),
});
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { data: { user }, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName, phone: data.phone },
      },
    });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: data.fullName,
        phone: data.phone,
      });
    }
    setLoading(false);
    router.push('/multi-farm');
    router.refresh();
  }

  return (
    <div className="card shadow-subtle">
      <h1 className="text-2xl font-bold text-ink mb-xs">Create account</h1>
      <p className="text-sm text-body mb-lg">Get started with PoultryOS</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
        <div>
          <label className="label">Full name</label>
          <input className="input" {...register('fullName')} />
          {errors.fullName && <p className="text-sm text-danger mt-xs">{errors.fullName.message}</p>}
        </div>
        <div>
          <label className="label">Mobile number</label>
          <input className="input" placeholder="+91XXXXXXXXXX" {...register('phone')} />
          {errors.phone && <p className="text-sm text-danger mt-xs">{errors.phone.message}</p>}
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" {...register('email')} />
          {errors.email && <p className="text-sm text-danger mt-xs">{errors.email.message}</p>}
        </div>
        <div>
          <label className="label">Password</label>
          <input type="password" className="input" {...register('password')} />
          {errors.password && <p className="text-sm text-danger mt-xs">{errors.password.message}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {error && <p className="text-sm text-danger mt-md">{error}</p>}

      <p className="text-sm text-body mt-lg text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-dark font-semibold">Sign in</Link>
      </p>
    </div>
  );
}
