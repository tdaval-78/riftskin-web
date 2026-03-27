# RiftSkin Web

Marketing + account site for RiftSkin (static HTML/CSS/JS), deployed on Vercel.

## Current mode

- Private free beta
- Pricing/checkout UI hidden from public navigation
- `robots.txt` blocks indexing (`Disallow: /`)

## Routes

- `/` Home / product overview
- `/account.html` Sign in / sign up / password reset trigger / account session
- `/faq.html` FAQ
- `/support.html` Support page
- `/legal.html` Legal summary
- `/pricing.html` Private placeholder page (not linked publicly)
- `/auth/callback` Supabase callback page (email confirmation + password reset form)
- `/auth/email-confirmed` Optional static confirmation page

## Languages

- Supported: English, French, Spanish, Portuguese, Chinese (Mandarin)
- Auto language selection based on browser locale
- Manual language selector in top navigation
- User choice persisted in `localStorage` key `riftskin_lang`

## Configuration

Edit `/assets/config.js`:

- `supabaseUrl`, `supabaseAnonKey`
- `supportEmail`
- Paddle fields can stay empty while private beta is free

## Supabase requirements

- Auth providers: Email enabled
- Redirect URL: `https://riftskin.com/auth/callback`
- Email template links should point to `https://riftskin.com/auth/callback`
- Email templates ready to paste: `/supabase/email-templates/`
- `profiles` table must exist (for unique username check during sign-up)
- Run SQL bootstrap: [supabase/activation_keys.sql](/Users/thomasdaval/Desktop/riftskin-web/supabase/activation_keys.sql)
- Add yourself to `app_admins` (SQL comment at bottom of the file)

## Activation key flow

- Admin creates keys from `/account.html` (admin panel)
- Admin can directly attach a key to an existing account email from `/account.html`
- User logs in and redeems key from `/account.html`
- Access state is stored in `user_access`
- App-side enforcement should call Supabase RPC `has_active_access()` at login/startup

## Deploy

This repository is connected to Vercel project `web`.

- Push to `main` => automatic production deploy
- Local helper script: `/scripts/sync-and-deploy.sh`
