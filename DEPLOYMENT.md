# Deploy MyPisara to Vercel

MyPisara is fully separate from EditDesk: its own Vercel project, domain, Neon database, Blob store and accounts. Nothing here touches EditDesk.

## 1. Create the Vercel project

```bash
npx vercel link
```

Choose **Create a new project** and name it `mypisara`. Do not link it to the existing `editdesk` project.

## 2. Database

In the new Vercel project, open **Storage → Create Database → Neon**, create a new database for MyPisara, and connect it to Production and Preview. Vercel adds `DATABASE_URL`.

## 3. File storage

Open **Storage → Create → Blob**, choose **Private** access, and connect it to Production and Preview. Vercel adds `BLOB_READ_WRITE_TOKEN`.

## 4. Environment variables

Add these in **Settings → Environment Variables**:

| Name | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32`. Required in production once `DATABASE_URL` is set; the app refuses to start auth without it. |
| `BETTER_AUTH_URL` | your public origin, e.g. `https://mypisara.com` |
| `DISABLE_SIGN_UP` | `false` to allow sign-ups, `true` to keep it private |
| `STORAGE_QUOTA_MB` | Optional. Upload storage per account in MB, default `1024` |

Use `sslmode=verify-full` in `DATABASE_URL` (Neon's default `require` is treated as the same thing by the driver and warns).

Give **Preview** deployments their own Neon branch and `DATABASE_URL`, so test accounts and boards never share a database with Production.

## 5. Run the migrations

```bash
npx vercel env pull .env.local
npm run db:migrate
```

This creates the account tables, the restricted `mypisara_app` role and the `boards` table with row-level security.

## 6. Deploy and add the domain

```bash
npx vercel --prod
```

Then open **Settings → Domains**, add your domain, and follow Vercel's DNS instructions. After the domain is live, set `BETTER_AUTH_URL` to it and redeploy so sign-in cookies use the right origin.

Open `/login` and create your account.

## Optional features and their migrations

Run `npm run db:migrate` after deploying new code. Each feature below degrades
gracefully until its migration has been applied.

| Migration | Feature |
| --- | --- |
| `0003_user_preferences.sql` | Appearance (theme, accent, size) synced to the account |
| `0004_board_trash.sql` | Deleted boards kept in Trash for 30 days |
| `0005_dashboard_preferences.sql` | Favorites, sort and layout synced to the account |
| `0006_board_versions.sql` | Created the table for version history, a feature that was later removed |
| `0007_drop_board_versions.sql` | Drops that table again |

### Email (password reset and email confirmation)

Set `RESEND_API_KEY` and `EMAIL_FROM`. Without both, "Forgot your password?"
and email confirmation are hidden in production. In development the message
is printed to the server console instead of being sent.

## Before going live: smoke test

On a Preview deployment, with migrations applied:

1. Create an account, sign out, sign back in.
2. Create a board from a template, add a note, a to-do and a link; reload.
3. Upload an image and a file; confirm they load.
4. Export PNG, PDF, Markdown and a backup; import the backup.
5. Move a board to Trash and restore it.
6. Change name, email and password; check the Devices list.
7. If email is configured: request a password reset and complete it.
