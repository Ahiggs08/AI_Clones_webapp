export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body if it's a string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  
  const { passcode } = body || {};
  
  // Get the valid passcode from environment variable
  const validPasscode = process.env.APP_PASSCODE;
  
  if (!validPasscode) {
    console.error('[Auth] APP_PASSCODE environment variable not set');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  if (passcode === validPasscode) {
    return res.json({ success: true });
  }

  return res.json({ success: false });
}
