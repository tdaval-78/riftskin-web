# Supabase + Resend SMTP setup

This project already uses the native Supabase Auth flow for:

- signup confirmation email
- password reset email
- confirmation email resend

To avoid the default Supabase email cap in production, configure **Custom SMTP** with **Resend** in the Supabase dashboard.

## Why this is required

Supabase's default email service is not suitable for production:

- default email sending is limited to **2 emails per hour**
- it is intended for testing / non-production use

With custom SMTP enabled:

- Supabase keeps the native auth token flow
- emails are sent through Resend
- you can then raise auth email rate limits in Supabase

## Resend SMTP values

Use the official Resend SMTP credentials:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: your Resend API key

Sender values:

- Sender email: use your verified sending domain email, for example `noreply@riftskin.com`
- Sender name: `RIFTSKIN`

## Supabase dashboard configuration

In Supabase:

1. Open `Authentication`
2. Open `Email`
3. Open `SMTP Settings`
4. Enable `Custom SMTP`
5. Fill:
   - sender email
   - sender name
   - host
   - port
   - username
   - password
6. Save

Then confirm auth URL settings:

- Site URL: `https://riftskin.com/auth/callback`
- Redirect URL allow list: `https://riftskin.com/auth/callback`

## Email templates to paste

Use:

- `supabase/email-templates/confirm-signup.html`
- `supabase/email-templates/password-reset.html`

Keep the CTA URL as:

- `{{ .ConfirmationURL }}`

Do not replace the confirmation URL with a hardcoded custom link, otherwise Supabase token validation will break.

## Rate limit after SMTP setup

Once custom SMTP is enabled, update the Supabase Auth rate limit for sent emails in the dashboard if needed.

Recommended initial value:

- `rate_limit_email_sent`: `25`

Increase only if needed and if your Resend account/domain is ready for it.

## Current web app behavior

The web app is already wired for this setup:

- signup sends confirmation email via Supabase Auth
- forgot password sends reset email via Supabase Auth
- sign-in blocks unconfirmed users with a clear message
- users can resend the confirmation email from `/account.html`
- both flows land on `/auth/callback`
