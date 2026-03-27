# Supabase email templates

Use these files in `Authentication -> Email Templates` in Supabase:

- `confirm-signup.html` for `Confirm signup`
- `password-reset.html` for `Reset password`

Required auth URL configuration:

- Site URL: `https://riftskin.com/auth/callback`
- Redirect URL allow list: `https://riftskin.com/auth/callback`

Important:

- Keep the CTA link on `{{ .ConfirmationURL }}` so Supabase can validate the token.
- The web app now handles both email confirmation and password reset on `/auth/callback`.
