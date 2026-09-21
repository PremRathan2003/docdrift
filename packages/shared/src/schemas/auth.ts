import { z } from 'zod';

/**
 * Password rules follow NIST SP 800-63B: a minimum length, a generous maximum,
 * and no forced "one symbol, one digit" rules (those make passwords weaker in
 * practice). The maximum stops someone sending a 10 MB "password".
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});

/** Login does not re-check password rules: old accounts may predate them. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** The only user fields the API ever sends to the browser. */
export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const meResponseSchema = z.object({ user: publicUserSchema });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
