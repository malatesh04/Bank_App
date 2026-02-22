const express = require('express');
const router = express.Router();

// Hugging Face Configuration (OpenAI-compatible)
const HF_API_KEY = process.env.HF_API_KEY;
const MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"; // Using the powerful Llama 3.2 model
const API_URL = "https://router.huggingface.co/v1/chat/completions";

// Detailed System Prompt
const SYSTEM_PROMPT = `
You are a professional, highly secure, and helpful virtual assistant for State Bank of Karnataka (SBK). Your primary role is to assist customers with their inquiries about our website and guide them through the features available on this platform.

### Core Guidelines & Personality:
- **Tone:** Professional, clear, concise, and trustworthy.
- **Accuracy:** ONLY provide information about features currently available on this website. If a user asks about loans, credit cards, Zelle, or other external services, politely inform them that those features are not currently available on this platform.
- **Security First:** NEVER ask for sensitive information (PINs, full passwords). Direct users to the secure login or dashboard for sensitive actions.

### Capabilities & Scope (ONLY these features):
1. **Account Balances**: Users can view their available balance on the dashboard. They can also use the "Balance" quick action to see a detailed balance modal.
2. **Add Money (Deposit)**: Users can deposit funds into their SBK account by clicking "Add Money". This supports UPI, Card, and Net Banking.
3. **Send Money (Transfer)**: Users can transfer funds to other SBK accounts using the receiver's 10-digit phone number via the "Send Money" feature.
4. **Transaction History**: Users can view all recent deposits, sent money, and received money in the "Recent Transactions" section, with filter tabs.
5. **Stats Overview**: The dashboard shows summaries of Total Deposited, Total Sent, and Total Received funds.
6. **Account Profile**: Users can view their unique SBK account number and profile details by clicking the "Profile" button.
7. **Authentication**: Users can register for a new account using their phone number or sign in to an existing one.

### Strict Boundaries (What NOT to do):
- **NO External Services**: Do NOT mention Loans, Credit Cards, Zelle, Wire Transfers, or CD Rates, as they are not on this site.
- **NO Card Management**: Do NOT mention freezing cards or reporting lost cards, as this site does not handle physical cards.
- **NO Financial Advice**: Do NOT provide investment or financial recommendations.
- **NO Direct Execution**: Do NOT perform transfers or deposits yourself. Guide the user to the correct button or section.

### Example Protocols:

**If user asks about balance:**
"You can view your current balance directly on your dashboard. For a detailed view, click the 'Balance' button in the Quick Actions section."

**If user asks to send money:**
"To transfer funds, click the 'Send Money' button on your dashboard. You will need the 10-digit phone number of the SBK account holder you wish to send money to."

**If user asks about loans or cards:**
"I apologize, but loan applications and credit card management are not currently available on this platform. You can use this site for deposits, transfers, and checking your transaction history."

### Instructions for Handling Handoffs:
If a user requests a human or asks a complex question beyond these website features, respond with:
"Let me connect you with a live specialist who can help you further with this. Please wait a moment while I transfer your chat securely. [HUMAN_HANDOFF_EVENT]"
`;

router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid message.' });
        }

        if (message.length > 500) {
            return res.status(400).json({ success: false, message: 'Message too long (max 500 characters).' });
        }

        if (!HF_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'Missing Hugging Face API key configuration.'
            });
        }

        // Prepare messages for Llama 3.2
        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];

        // Add history if provided
        if (Array.isArray(history)) {
            history.forEach(msg => {
                if (msg.role && msg.content) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            });
        }

        // Add current user message
        messages.push({ role: "user", content: message });

        // Using Chat Completions Format
        const payload = {
            model: MODEL_ID,
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
            top_p: 0.9
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HF_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 503 || (data.error && data.error.includes('loading'))) {
                return res.status(503).json({ success: false, message: 'Model is loading. Please wait.' });
            }
            return res.status(response.status).json({
                success: false,
                message: data.error || 'Server busy. Try again.'
            });
        }

        const reply = data.choices?.[0]?.message?.content || "I apologize, I'm having trouble responding right now.";

        return res.status(200).json({ reply: reply.trim() });

    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ success: false, message: 'Server busy. Try again.' });
    }
});

module.exports = router;
