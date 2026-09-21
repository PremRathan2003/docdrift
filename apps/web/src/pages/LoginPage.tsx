import { loginRequestSchema } from '@docdrift/shared';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthCard } from '../components/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useLogin } from '../lib/auth';
import {
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formErrorMessage,
  retryAfterSeconds,
  type FieldErrors,
} from '../lib/form-errors';
import { safeNextPath } from '../lib/safe-redirect';
import { formatSeconds, useCountdown } from '../lib/use-countdown';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lockSeconds, setLockSeconds] = useState<number | null>(null);
  const remaining = useCountdown(lockSeconds);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      setFieldErrors(errors);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setFieldErrors({});
    login.mutate(parsed.data, {
      onSuccess: () => navigate(safeNextPath(params.get('next')), { replace: true }),
      onError: (err) => {
        setFieldErrors(fieldErrorsFromApi(err));
        setLockSeconds(retryAfterSeconds(err));
        passwordRef.current?.select();
      },
    });
  }

  const locked = remaining > 0;
  // A rate-limit message disappears once the countdown is over.
  const rateLimited = retryAfterSeconds(login.error) !== null;
  const showError = login.isError && (!rateLimited || locked);

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to DocDrift?{' '}
          <Link
            to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {showError && (
          <Alert>
            {locked
              ? `Too many attempts. You can try again in ${formatSeconds(remaining)}.`
              : formErrorMessage(login.error)}
          </Alert>
        )}
        <TextField
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />
        <Button type="submit" className="w-full" loading={login.isPending} disabled={locked}>
          {locked ? `Try again in ${formatSeconds(remaining)}` : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
