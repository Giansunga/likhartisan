import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'LikhArtisan <onboarding@resend.dev>';

function fmt(amount) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function sendOrderConfirmation({
  orderId,
  userName,
  userEmail,
  items,
  subtotal,
  shippingFee,
  total,
  deliveryOption,
  shopName,
}) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping order confirmation email');
    return;
  }

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E8E0D8;font-size:0.9rem;">${item.productName}${item.variation ? ` (${item.variation})` : ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8E0D8;font-size:0.9rem;text-align:center;">${item.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8E0D8;font-size:0.9rem;text-align:right;">${fmt(item.price * item.qty)}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#2A1A0E;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="font-size:1.5rem;font-weight:700;color:#8B6B4A;margin:0;">LikhArtisan</h1>
        <p style="font-size:0.85rem;color:#999;margin:4px 0 0;">Filipino Pottery Marketplace</p>
      </div>

      <div style="background:#F0EBE4;border-radius:12px;padding:24px;margin-bottom:24px;">
        <h2 style="font-size:1.15rem;font-weight:700;margin:0 0 8px;">Order Confirmed</h2>
        <p style="font-size:0.9rem;color:#666;margin:0;">Thank you, ${userName}! Your order has been placed successfully.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="border-bottom:2px solid #E8E0D8;">
            <th style="padding:8px 12px;text-align:left;font-size:0.8rem;color:#999;font-weight:600;">ITEM</th>
            <th style="padding:8px 12px;text-align:center;font-size:0.8rem;color:#999;font-weight:600;">QTY</th>
            <th style="padding:8px 12px;text-align:right;font-size:0.8rem;color:#999;font-weight:600;">TOTAL</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="border-top:2px solid #E8E0D8;padding-top:16px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.9rem;color:#666;">Subtotal</span>
          <span style="font-size:0.9rem;">${fmt(subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.9rem;color:#666;">Shipping (${deliveryOption === 'pickup' ? 'Pickup' : 'Delivery'})</span>
          <span style="font-size:0.9rem;">${fmt(shippingFee)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.05rem;border-top:1px solid #E8E0D8;padding-top:12px;margin-top:8px;">
          <span>Total</span>
          <span style="color:#8B6B4A;">${fmt(total)}</span>
        </div>
      </div>

      ${shopName ? `<p style="font-size:0.85rem;color:#666;margin-bottom:24px;">Shop: <strong>${shopName}</strong></p>` : ''}

      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://likhartisan.ph/dashboard?tab=purchases" style="display:inline-block;padding:12px 32px;background:#8B6B4A;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;">View My Orders</a>
      </div>

      <hr style="border:none;border-top:1px solid #E8E0D8;margin:24px 0;" />

      <p style="font-size:0.8rem;color:#999;text-align:center;">
        Order ID: ${orderId}<br />
        Questions? Contact us at <a href="mailto:support@likhartisan.ph" style="color:#8B6B4A;">support@likhartisan.ph</a> or call +63 967 671 1111
      </p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: userEmail,
      subject: `Order Confirmed - ${orderId}`,
      html,
    });
    if (error) {
      console.error(`[email] Resend rejected order confirmation for ${orderId}:`, error);
      return;
    }
    console.log(`[email] Order confirmation sent to ${userEmail} for order ${orderId}`, data?.id || '');
  } catch (err) {
    console.error('[email] Failed to send order confirmation:', err);
  }
}
