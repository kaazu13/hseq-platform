import { z } from "zod";

/**
 * Shared schema for the login Server Function — used for both client-side
 * field validation and the server-side check inside the Server Function
 * itself. See docs/API_CONVENTIONS.md §5 (Validation).
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
