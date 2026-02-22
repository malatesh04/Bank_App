document.addEventListener('DOMContentLoaded', () => {
    // Inject Chatbot HTML
    const chatbotHTML = `
        <div class="chatbot-container">
            <button class="chatbot-toggle" id="chatbot-toggle">
                <i class="fa-solid fa-comments"></i>
            </button>
            <div class="chatbot-window" id="chatbot-window">
                <div class="chatbot-header">
                    <h3><i class="fa-solid fa-headset"></i> SBK Assistance</h3>
                    <button class="close-chat" id="close-chat">&times;</button>
                </div>
                <div class="chatbot-messages" id="chatbot-messages">
                    <div class="message message-bot">
                        Hello! I'm your SBK Assistance virtual agent. How can I help you with your banking needs today?
                    </div>
                </div>
                <div class="typing-indicator" id="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
                <div class="suggestion-chips" id="suggestion-chips">
                    <div class="chip" data-msg="Check my balance">Check Balance</div>
                    <div class="chip" data-msg="Lost my debit card">Lost Card</div>
                    <div class="chip" data-msg="Latest interest rates">Interest Rates</div>
                    <div class="chip" data-msg="Talk to an agent">Human Agent</div>
                </div>
                <form class="chatbot-input-area" id="chatbot-form">
                    <input type="text" id="chatbot-input" placeholder="Type your message..." maxlength="500" autocomplete="off">
                    <button type="submit" class="chatbot-send-btn" id="chatbot-send">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const toggle = document.getElementById('chatbot-toggle');
    const window = document.getElementById('chatbot-window');
    const closeBtn = document.getElementById('close-chat');
    const form = document.getElementById('chatbot-form');
    const input = document.getElementById('chatbot-input');
    const messages = document.getElementById('chatbot-messages');
    const indicator = document.getElementById('typing-indicator');
    const chips = document.getElementById('suggestion-chips');

    // Toggle Window
    toggle.addEventListener('click', () => {
        window.classList.toggle('active');
        if (window.classList.contains('active')) {
            input.focus();
        }
    });

    closeBtn.addEventListener('click', () => {
        window.classList.remove('active');
    });

    // Handle Chip Clicks
    chips.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip')) {
            const msg = e.target.getAttribute('data-msg');
            sendMessage(msg);
        }
    });

    // Handle Form Send
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        sendMessage(text);
        input.value = '';
    });

    let chatHistory = [];

    async function sendMessage(text) {
        // Add user message to UI
        addMessage(text, 'user');

        // Add to history
        chatHistory.push({ role: 'user', content: text });

        // Keep only last 10 messages for context
        if (chatHistory.length > 10) chatHistory.shift();

        // Show indicator
        indicator.style.display = 'flex';
        scrollToBottom();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: chatHistory.slice(0, -1) // Send previous history (excluding current message which is passed via 'message' or just send the whole thing)
                })
            });

            const data = await response.json();

            indicator.style.display = 'none';

            if (data.reply) {
                // Add bot reply to UI
                const replyText = data.reply.replace('[HUMAN_HANDOFF_EVENT]', '').trim();
                addMessage(replyText, 'bot');

                // Add to history
                chatHistory.push({ role: 'assistant', content: replyText });

                if (data.reply.includes('[HUMAN_HANDOFF_EVENT]')) {
                    setTimeout(() => {
                        addMessage('Connecting you to a live specialist... ⏳', 'bot');
                    }, 1000);
                }
            } else {
                addMessage(data.message || 'Server busy. Try again.', 'bot');
            }
        } catch (error) {
            indicator.style.display = 'none';
            addMessage('Server busy. Try again.', 'bot');
        }

        scrollToBottom();
    }

    function addMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${sender}`;
        msgDiv.textContent = text;
        messages.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        messages.scrollTop = messages.scrollHeight;
    }
});
