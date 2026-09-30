"""Render the six LikhArtisan Supabase Auth email bodies.

Run from this directory with: python render_templates.py
The generated HTML files are ready to paste into Supabase.
"""

from html import escape
from pathlib import Path
from string import Template


ROOT = Path(__file__).resolve().parent
WORDMARK = "https://likhartisan.com/images/likhartisan-brown-wordmark.png"
CONFIRMATION_URL = "{{ .ConfirmationURL }}"
VERIFY_EMAIL_URL = "https://likhartisan.com/verify-email"
TOKEN = "{{ .Token }}"
NEW_EMAIL = "{{ .NewEmail }}"


SPECS = {
    "confirm-signup.html": {
        "subject": "Confirm your LikhArtisan account",
        "preheader": "Use this code to verify your LikhArtisan email address.",
        "eyebrow": "ACCOUNT CONFIRMATION",
        "heading": "Verify your email.",
        "intro": "Enter this eight-digit code on LikhArtisan to finish creating your account.",
        "button": "Enter verification code",
        "button_url": VERIFY_EMAIL_URL,
        "token_label": "YOUR VERIFICATION CODE",
        "note": "If you did not create an account, ignore this email. Never share this code with anyone.",
    },
    "invite-user.html": {
        "subject": "You're invited to LikhArtisan",
        "preheader": "Accept your invitation to create a LikhArtisan account.",
        "eyebrow": "ACCOUNT INVITATION",
        "heading": "You’re invited.",
        "intro": "An invitation to create a LikhArtisan account has been sent to this address. Use the button below to accept it and finish setting up your account.",
        "button": "Accept invitation",
        "note": "If you were not expecting this invitation, you can safely ignore this email.",
    },
    "magic-link-or-otp.html": {
        "subject": "Sign in to LikhArtisan",
        "preheader": "Use your sign-in link or one-time code to access LikhArtisan.",
        "eyebrow": "SECURE SIGN IN",
        "heading": "Your sign-in link.",
        "intro": "Use the button to sign in to your LikhArtisan account. If you requested a one-time code, you can enter the code below instead.",
        "button": "Sign in to LikhArtisan",
        "token_label": "YOUR ONE-TIME CODE",
        "note": "If you did not request this sign-in, ignore this email. Never share the code with anyone.",
    },
    "change-email-address.html": {
        "subject": "Confirm your new LikhArtisan email address",
        "preheader": "Confirm the new address requested for your LikhArtisan account.",
        "eyebrow": "EMAIL ADDRESS CHANGE",
        "heading": "Confirm your new email.",
        "intro": "A change was requested for the email address on your LikhArtisan account. Check the new address below before confirming.",
        "new_email": True,
        "button": "Confirm email change",
        "note": "If you did not request this change, do not use the link. Contact support so we can help secure your account.",
    },
    "reset-password.html": {
        "subject": "Reset your LikhArtisan password",
        "preheader": "Use this link to choose a new password for your LikhArtisan account.",
        "eyebrow": "PASSWORD RESET",
        "heading": "Set a new password.",
        "intro": "We received a request to reset your LikhArtisan password. Use the button below to choose a new one.",
        "button": "Reset password",
        "note": "If you did not request a password reset, you can ignore this email. Your password will stay the same.",
    },
    "reauthentication.html": {
        "subject": "Your LikhArtisan verification code",
        "preheader": "Use your one-time code to confirm a sensitive account action.",
        "eyebrow": "IDENTITY CHECK",
        "heading": "Verify it’s you.",
        "intro": "Enter this one-time code where LikhArtisan asked you to confirm an account action.",
        "token_label": "YOUR VERIFICATION CODE",
        "note": "If you did not request this code, do not share it. Contact support if you are concerned about your account.",
    },
}


SHELL = Template("""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>$subject</title>
  <style>
    @media screen and (max-width: 620px) {
      .outer-pad { padding: 18px 10px !important; }
      .header-pad { padding: 26px 22px !important; }
      .hero-pad { padding: 30px 22px !important; }
      .body-pad { padding: 28px 22px !important; }
      .footer-pad { padding: 22px !important; }
      .hero-title { font-size: 30px !important; }
      .wordmark { width: 208px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F6F1EA;color:#3D2B1F;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#F6F1EA;max-height:0;max-width:0;opacity:0;overflow:hidden;">$preheader</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F6F1EA" style="border-collapse:collapse;width:100%;background-color:#F6F1EA;">
    <tr><td class="outer-pad" align="center" style="padding:40px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;background-color:#FFFCF8;border:1px solid #E1D3C4;">
        <tr><td bgcolor="#823E0B" style="height:6px;background-color:#823E0B;font-size:1px;line-height:6px;">&nbsp;</td></tr>
        <tr><td class="header-pad" style="padding:32px 38px 27px;background-color:#FFFCF8;">
          <img class="wordmark" src="$wordmark" width="232" alt="LikhArtisan" style="display:block;width:232px;max-width:100%;height:auto;border:0;color:#823E0B;font-family:Georgia,serif;font-size:24px;font-weight:bold;">
        </td></tr>
        <tr><td bgcolor="#F3E9DE" class="hero-pad" style="padding:38px 38px 40px;background-color:#F3E9DE;border-top:1px solid #E1D3C4;border-bottom:1px solid #E1D3C4;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr>
            <td width="32" valign="middle" style="width:32px;border-top:3px solid #AF6944;font-size:1px;line-height:3px;">&nbsp;</td>
            <td valign="middle" style="padding-left:12px;color:#823E0B;font-size:11px;font-weight:bold;letter-spacing:2px;line-height:1.5;">$eyebrow</td>
          </tr></table>
          <h1 class="hero-title" style="margin:20px 0 14px;color:#3D2B1F;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:normal;line-height:1.16;">$heading</h1>
          <p style="margin:0;color:#5C493A;font-size:16px;line-height:1.7;">$intro</p>
        </td></tr>
        <tr><td class="body-pad" style="padding:34px 38px 38px;background-color:#FFFCF8;">
$content
          <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E8DDD1;color:#6D5B4B;font-size:13px;line-height:1.65;">$note</p>
        </td></tr>
        <tr><td class="footer-pad" bgcolor="#F8F3ED" style="padding:23px 38px;background-color:#F8F3ED;border-top:1px solid #E1D3C4;">
          <p style="margin:0 0 4px;color:#3D2B1F;font-size:13px;font-weight:bold;line-height:1.5;">Need help with your account?</p>
          <p style="margin:0;color:#6D5B4B;font-size:13px;line-height:1.6;">Write to <a href="mailto:support@likhartisan.com" style="color:#823E0B;text-decoration:underline;">support@likhartisan.com</a></p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#8D7866;font-size:11px;letter-spacing:1px;line-height:1.6;">LIKHARTISAN · ACCOUNT EMAIL</p>
    </td></tr>
  </table>
</body>
</html>
""")


def render_content(spec):
    parts = []
    if spec.get("new_email"):
        parts.append(f'''          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin:0 0 25px;border:1px solid #E1D3C4;background-color:#F8F3ED;"><tr><td style="padding:16px 20px;">
            <p style="margin:0 0 5px;color:#87654C;font-size:10px;font-weight:bold;letter-spacing:1.8px;line-height:1.5;">NEW EMAIL ADDRESS</p>
            <p style="margin:0;color:#3D2B1F;font-size:16px;font-weight:bold;line-height:1.5;word-break:break-all;">{NEW_EMAIL}</p>
          </td></tr></table>''')
    if button := spec.get("button"):
        button_url = spec.get("button_url", CONFIRMATION_URL)
        parts.append(f'''          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td align="center" bgcolor="#823E0B" style="background-color:#823E0B;border-radius:7px;">
            <a href="{button_url}" style="display:block;padding:16px 22px;color:#FFFFFF;font-size:15px;font-weight:bold;line-height:1.4;text-align:center;text-decoration:none;">{escape(button)} &rarr;</a>
          </td></tr></table>''')
    if token_label := spec.get("token_label"):
        top_margin = "26px" if spec.get("button") else "0"
        parts.append(f'''          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:{top_margin};background-color:#F8F3ED;border-left:4px solid #AF6944;"><tr><td style="padding:19px 22px;">
            <p style="margin:0 0 8px;color:#87654C;font-size:10px;font-weight:bold;letter-spacing:1.8px;line-height:1.5;">{escape(token_label)}</p>
            <p style="margin:0;color:#3D2B1F;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:4px;line-height:1.4;word-break:break-all;">{TOKEN}</p>
          </td></tr></table>''')
    if spec.get("button"):
        button_url = spec.get("button_url", CONFIRMATION_URL)
        parts.append(f'''          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:27px;background-color:#F8F3ED;"><tr><td style="padding:18px 20px;">
            <p style="margin:0 0 7px;color:#6D5B4B;font-size:12px;font-weight:bold;line-height:1.5;">Button not working?</p>
            <p style="margin:0;color:#6D5B4B;font-size:12px;line-height:1.6;">Copy this link into your browser:</p>
            <p style="margin:6px 0 0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{button_url}" style="color:#823E0B;text-decoration:underline;">{button_url}</a></p>
          </td></tr></table>''')
    return "\n".join(parts)


def main():
    for filename, spec in SPECS.items():
        html = SHELL.substitute(
            subject=escape(spec["subject"]),
            preheader=escape(spec["preheader"]),
            wordmark=WORDMARK,
            eyebrow=escape(spec["eyebrow"]),
            heading=escape(spec["heading"]),
            intro=escape(spec["intro"]),
            content=render_content(spec),
            note=escape(spec["note"]),
        )
        (ROOT / filename).write_text(html, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
