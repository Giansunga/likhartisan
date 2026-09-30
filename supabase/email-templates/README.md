# LikhArtisan authentication email templates

These six HTML files are the source of truth for the hosted Supabase project's **Authentication → Emails → Templates** settings. Each file is complete and can be pasted into its matching template body. Brevo is the SMTP delivery service; these bodies are edited in Supabase, not in Brevo. Security notification templates are outside this set.

| Supabase template | Subject to enter | HTML file |
| --- | --- | --- |
| Confirm sign up | Confirm your LikhArtisan account | `confirm-signup.html` |
| Invite user | You're invited to LikhArtisan | `invite-user.html` |
| Magic link or OTP | Sign in to LikhArtisan | `magic-link-or-otp.html` |
| Change email address | Confirm your new LikhArtisan email address | `change-email-address.html` |
| Reset password | Reset your LikhArtisan password | `reset-password.html` |
| Reauthentication | Your LikhArtisan verification code | `reauthentication.html` |

## Brevo and Supabase setup

1. In Brevo, authenticate `likhartisan.com` as a sending domain using the exact records shown for the account. Review any existing DMARC record before changing DNS; keep a single valid DMARC record. Confirm Brevo reports the domain as authenticated.
2. Register the sender **LikhArtisan <no-reply@likhartisan.com>** in Brevo and enable transactional sending. Create a dedicated SMTP key. Keep the key in Brevo and the Supabase dashboard only; never put it in this repository, a screenshot, or an issue.
3. In Supabase **Authentication → Emails → SMTP Settings**, enable custom SMTP and set sender name `LikhArtisan`, sender address `no-reply@likhartisan.com`, host `smtp-relay.brevo.com`, port `587`, username to the **SMTP login shown in Brevo**, and password to the **Brevo SMTP key** (not a Brevo API key). Save and confirm the settings are active.
4. In Supabase **Authentication → URL Configuration**, confirm the Site URL is `https://likhartisan.com` and the redirect allow list permits `https://likhartisan.com/update-password`. The app's password-reset request supplies that route as its redirect. Check any separately approved development or preview origins before testing them.
5. In Supabase **Authentication → Emails → Templates**, open each row in the table above, enter its subject, paste the entire matching HTML file into the body, preview it, and save. Apply all six to the same project. No Brevo-hosted template is needed for these Supabase Auth messages.
6. Turn off Brevo click/link tracking for these transactional authentication messages if the account exposes that setting, and verify in received mail that Supabase action URLs have not been rewritten. Link rewriting can break authentication flows.

## Verification and rollback

- Preview all six at narrow and wide widths. Confirm the wordmark, action text, code, fallback link, support address, and required `{{ ... }}` variables render correctly. The text `LikhArtisan` is the image's alt fallback when images are blocked.
- Use test accounts and inboxes to complete sign-up confirmation and password reset through the website. The reset link must reach `/update-password` and allow a password change. For invite, magic link/OTP, email change, and reauthentication, use controlled Supabase test flows where enabled; record any flow that cannot be triggered rather than marking it passed.
- Check Brevo's transactional logs for accepted and delivered messages. Inspect received headers for domain authentication, and check both the button and visible fallback URL. If a template unexpectedly falls back to Supabase's default, inspect Supabase Auth logs for template parsing errors.
- Keep a copy of the previous Supabase subjects and bodies before replacing them. If a rollout fails, restore those values in the dashboard and re-test the active sign-up and reset flows. Rotate the Brevo SMTP key if it is exposed; do not copy it into the rollback notes.

The emails use `{{ .ConfirmationURL }}` for action links, `{{ .Token }}` for one-time codes, and `{{ .NewEmail }}` only in the email-change message. Keep those placeholders intact. The static wordmark URL is `https://likhartisan.com/images/likhartisan-brown-wordmark.png`.
