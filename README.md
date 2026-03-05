# RiftSkin Web

Marketing + account site for RiftSkin (static HTML/CSS/JS), deployed on Vercel.

## Routes

- `/` Home / product overview
- `/pricing.html` Subscription (7-day trial, then 20 EUR/month)
- `/faq.html` FAQ
- `/support.html` Support page
- `/legal.html` Legal summary
- `/account.html` Sign in / sign up / password reset trigger / account session
- `/auth/callback` Supabase callback page (email confirmation + password reset form)
- `/auth/email-confirmed` Optional static confirmation page

## Configuration

Edit `/assets/config.js`:

- `supabaseUrl`, `supabaseAnonKey`
- `paddleEnvironment`
- `paddleClientToken` + `paddlePriceId` (or `paddleCheckoutUrl`)
- `paddleCustomerPortalUrl`
- `supportEmail`

## Supabase requirements

- Auth providers: Email enabled
- Redirect URL: `https://riftskin.com/auth/callback`
- Email template links should point to `https://riftskin.com/auth/callback`
- `profiles` table must exist (for unique username check during sign-up)

## Deploy

This repository is connected to Vercel project `web`.

- Push to `main` => automatic production deploy
- Local helper script: `/scripts/sync-and-deploy.sh`
