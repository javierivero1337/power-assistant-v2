document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const ctaContainer = document.getElementById('cta-container');
    const msgTemplate = document.getElementById('msg-template');
    const imgTemplate = document.getElementById('img-template');
    const typingTemplate = document.getElementById('typing-template');

    // Helper to format time
    const getTime = () => {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Helper to delay execution
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Add text message
    const addMessage = (text, sender = 'bot') => {
        const clone = msgTemplate.content.cloneNode(true);
        const msgDiv = clone.querySelector('.message');
        msgDiv.classList.add(sender);
        clone.querySelector('.message-content').textContent = text;
        clone.querySelector('.message-time').textContent = getTime();
        chatContainer.appendChild(clone);
        scrollToBottom();
    };

    // Add image message
    const addImage = (src, sender = 'bot') => {
        const clone = imgTemplate.content.cloneNode(true);
        const msgDiv = clone.querySelector('.message');
        msgDiv.classList.add(sender);
        
        const img = clone.querySelector('img');
        img.src = src;
        
        // Scroll when image loads to ensure full height is accounted for
        img.onload = () => {
            scrollToBottom();
        };
        
        clone.querySelector('.message-time').textContent = getTime();
        chatContainer.appendChild(clone);
        scrollToBottom();
    };

    // Typing indicator management
    let typingIndicatorElement = null;

    const showTyping = () => {
        if (typingIndicatorElement) return;
        const clone = typingTemplate.content.cloneNode(true);
        typingIndicatorElement = chatContainer.appendChild(clone.firstElementChild); // Append the div directly
        scrollToBottom();
    };

    const hideTyping = () => {
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
            typingIndicatorElement = null;
        }
    };

    // Scroll to bottom
    const scrollToBottom = () => {
        // Use parent element to scroll
        const parent = chatContainer.parentElement;
        parent.scrollTo({
            top: parent.scrollHeight,
            behavior: 'smooth'
        });
    };

    // Main Animation Sequence
    const runSequence = async () => {
        // Initial delay
        await delay(1000);

        // 1. Bot greeting
        addMessage("Hola! Qué imagen te gustaría editar hoy?", 'bot');

        await delay(1500);

        // 2. User uploads image
        // Assuming 'user' sender styles right align and change color
        addImage('img/studiobefore.jpg', 'user');

        await delay(1000);

        // 3. Bot thinking
        showTyping();
        
        // Simulate processing time
        await delay(2500);
        
        hideTyping();

        // 4. Bot response text
        addMessage("Aquí tienes tu imagen estilo Studio! ✨", 'bot');

        await delay(600);

        // 5. Bot sends edited image
        addImage('img/studioafter.jpeg', 'bot');

        await delay(1500);

        // 6. Show CTA
        ctaContainer.classList.add('visible');
        scrollToBottom();
    };

    // Start the sequence
    runSequence();
});


