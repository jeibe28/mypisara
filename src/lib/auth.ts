import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { del, list } from "@vercel/blob";
import { emailAvailable, emailTemplate, sendEmail } from "./email";
import { databaseConfigured, pool } from "./neon/database";

// Signs sessions. A missing secret must never fall back to a value that is
// public in the source, so production refuses to start auth without one. The
// placeholder only exists so `next build` can load the module without secrets.
function authSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !building && process.env.DATABASE_URL)
    throw new Error("BETTER_AUTH_SECRET must be set when DATABASE_URL is configured.");
  return "mypisara-build-only-secret-never-used-at-runtime";
}

const trustedOrigins = [
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
  "https://mypisara.vercel.app",
  "https://mypisara-*-editgrill.vercel.app",
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  appName: "MyPisara",
  database: pool,
  secret: authSecret(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    disableSignUp: process.env.DISABLE_SIGN_UP === "true",
    resetPasswordTokenExpiresIn: 60 * 60,
    // A reset proves the account is the user's, so other devices are signed out.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      if (!emailAvailable()) return;
      const { html, text } = emailTemplate({
        heading: "Reset your password",
        body: "Use the button below to choose a new password. The link works for one hour.",
        action: "Choose a new password",
        url,
      });
      await sendEmail({ to: user.email, subject: "Reset your MyPisara password", html, text });
    },
  },
  emailVerification: {
    sendOnSignUp: emailAvailable(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!emailAvailable()) return;
      const { html, text } = emailTemplate({
        heading: "Confirm your email",
        body: "Confirm this address so you can recover your account if you forget your password.",
        action: "Confirm email",
        url,
      });
      await sendEmail({ to: user.email, subject: "Confirm your MyPisara email", html, text });
    },
  },
  user: {
    // No email provider is connected, so address changes apply immediately.
    // Unconfirmed addresses change immediately and are then asked to confirm.
    // A confirmed address needs approval from the current inbox first.
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        if (!emailAvailable()) return;
        const { html, text } = emailTemplate({
          heading: "Approve your email change",
          body: `Someone asked to change your MyPisara email to ${newEmail}. Approve it only if that was you.`,
          action: "Approve change",
          url,
        });
        await sendEmail({ to: user.email, subject: "Approve your MyPisara email change", html, text });
      },
    },
    deleteUser: {
      enabled: true,
      // Boards and preferences cascade with the user row; uploaded files live in Blob storage.
      beforeDelete: async (user) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) return;
        try {
          for (const prefix of [`board-assets/${user.id}/`, `avatars/${user.id}/`]) {
            let cursor: string | undefined;
            do {
              const page = await list({ prefix, cursor });
              if (page.blobs.length) await del(page.blobs.map((blob) => blob.url));
              cursor = page.hasMore ? page.cursor : undefined;
            } while (cursor);
          }
        } catch (error) {
          console.error("Asset cleanup failed", error);
        }
      },
    },
  },
  advanced: {
    database: { generateId: "uuid", joins: true, validateSchema: false },
  },
  rateLimit: { storage: "database" },
  plugins: [nextCookies()],
});

export { databaseConfigured as configured };
export { emailAvailable };

export async function currentUser() {
  if (!databaseConfigured()) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
