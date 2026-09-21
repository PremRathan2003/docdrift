import { PASSWORD_MIN_LENGTH, registerRequestSchema } from '@docdrift/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthCard } from '../components/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useRegister } from '../lib/auth';
import {
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formErrorMessage,
  retryAfterSeconds,
  type FieldErrors,
} from '../lib/form-errors';
import { safeNextPath } from '../lib/safe-redirect';
import { formatSeconds, useCountdown } from '../lib/use-countdown';

export function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lockSeconds, setLockSeconds] = useState<number | null>(null);
  const remaining = useCountdown(lockSeconds);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const displayName = String(form.get('displayName') ?? '').trim();
    const parsed = registerRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
      displayName: displayName || undefined,
    });
    if (!parsed.success) {
      const errors = fieldErrorsFromZod(parsed.error);
      setFieldErrors(errors);
      // Move focus to the first field with a problem.
      const first = Object.keys(errors)[0];
      if (first) (formEl.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      return;
    }
    setFieldErrors({});
    register.mutate(parsed.data, {
      onSuccess: () => navigate(safeNextPath(params.get('next')), { replace: true }),
      onError: (err) => {
        setFieldErrors(fieldErrorsFromApi(err));
        setLockSeconds(retryAfterSeconds(err));
      },
    });
  }

  const locked = remaining > 0;
  // A rate-limit message disappears once the countdown is over.
  const rateLimited = retryAfterSeconds(register.error) !== null;
  const showError = register.isError && (!rateLimited || locked);

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {showError && (
          <Alert>
            {locked
              ? `Too many attempts. You can try again in ${formatSeconds(remaining)}.`
              : formErrorMessage(register.error)}
          </Alert>
        )}
        <TextField
          label="Name (optional)"
          name="displayName"
          autoComplete="name"
          error={fieldErrors.displayName}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
          error={fieldErrors.password}
        />
        <Button type="submit" className="w-full" loading={register.isPending} disabled={locked}>
          {locked ? `Try again in ${formatSeconds(remaining)}` : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
