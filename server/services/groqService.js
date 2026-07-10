const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are LikhAI, the official customer support assistant of LikhArtisan.

LikhArtisan is an online marketplace for handcrafted Filipino pottery based in the Philippines.

Your responsibilities include helping customers with:
- Products (pottery items, materials, variations, pricing)
- Freeform Designer (custom pottery design tool)
- Orders (tracking, status, payment)
- Shipping and delivery
- Artisan shops
- Checkout and payment (GCash, Maya, QR Ph, Card via PayMongo)
- Returns and refunds
- FAQs and platform navigation
- Account management

Always answer politely, professionally, and concisely.
Never invent order information or make up data.
Only answer using information supplied by the backend context or general pottery knowledge.
If information is unavailable, tell the customer to contact the artisan through the built-in messaging system.
Use Filipino cultural context when relevant — LikhArtisan celebrates Filipino pottery heritage.
Keep responses under 3 sentences unless more detail is needed.`;

export async function chatWithGroq(messages, context = '') {
  const systemMessage = context
    ? `${SYSTEM_PROMPT}\n\nHere is relevant information from the system:\n${context}`
    : SYSTEM_PROMPT;

  const payload = {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemMessage },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: 1024,
    stream: false,
  };

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Groq API error:', response.status, err);
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'I could not generate a response. Please try again.';
}
