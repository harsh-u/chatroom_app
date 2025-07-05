document.addEventListener('DOMContentLoaded', function() {
    // Fetch username for display
    let myUsername = '';
    fetch('/get_username')
        .then(res => res.json())
        .then(data => {
            document.getElementById('username').innerText = data.username;
            myUsername = data.username;
        });

    var socket;
    var form = document.getElementById('message-form');
    var input = document.getElementById('message-input');
    var chatBox = document.getElementById('chat-box');

    // Sound notification
    var notifySound = new Audio('/static/notify.mp3');
    notifySound.onerror = function() {
        console.error('Notification sound could not be loaded. Please ensure static/notify.mp3 exists and is a valid mp3 file.');
    };

    // Ensure dark mode is set on load
    document.body.classList.add('dark-mode');
    chatBox.classList.add('dark-chat-box');

    // Autofocus input on load
    input.focus();

    // Emoji picker
    const emojiList = ['😀','😂','😍','😎','😢','👍','🙏','🎉','🔥','❤️','😮','😡'];
    let emojiPicker = null;
    let emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'emoji-btn';
    emojiBtn.innerText = '😊';
    emojiBtn.title = 'Pick emoji';
    form.insertBefore(emojiBtn, input);

    emojiBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (emojiPicker) {
            emojiPicker.remove(); emojiPicker = null; return;
        }
        emojiPicker = document.createElement('div');
        emojiPicker.className = 'emoji-picker';
        emojiList.forEach(emoji => {
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.innerText = emoji;
            btn.onclick = function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                input.value += emoji;
                input.focus();
                emojiPicker.remove(); emojiPicker = null;
            };
            emojiPicker.appendChild(btn);
        });
        form.appendChild(emojiPicker);
    };
    document.addEventListener('click', function(e) {
        if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.remove(); emojiPicker = null;
        }
    });

    // Show placeholder if chat is empty
    function updatePlaceholder() {
        if (chatBox.children.length === 0) {
            let placeholder = document.createElement('div');
            placeholder.className = 'empty-placeholder';
            placeholder.innerText = 'No messages yet. Start the conversation!';
            chatBox.appendChild(placeholder);
        } else {
            let ph = chatBox.querySelector('.empty-placeholder');
            if (ph) ph.remove();
        }
    }
    updatePlaceholder();

    // Store reactions in memory (for demo)
    let messageReactions = [];
    function renderBlockReactions(idx) {
        const reactions = messageReactions[idx] || {};
        const bar = document.createElement('div');
        bar.className = 'block-reactions';
        Object.entries(reactions).forEach(([emoji, count]) => {
            if (count > 0) {
                const btn = document.createElement('span');
                btn.className = 'reaction';
                btn.innerHTML = emoji + (count > 0 ? ` <span>${count}</span>` : '');
                bar.appendChild(btn);
            }
        });
        return bar;
    }
    function rerenderChat() {
        chatBox.innerHTML = '';
        messages.forEach((msg, idx) => {
            let msgContainer = document.createElement('div');
            msgContainer.className = 'msg-container mb-2';
            let msgDiv = document.createElement('div');
            msgDiv.classList.add('d-flex', 'align-items-center');
            msgDiv.innerHTML = `
                <span class="avatar-circle me-2" style="background:${msg.color}">${msg.initial}</span>
                <div>
                    <b>${msg.username}</b> <span class="text-muted small">[${msg.timestamp}]</span><br>
                    <span>${msg.message}</span>
                </div>
            `;
            // Emoji action button
            let emojiBtn = document.createElement('button');
            emojiBtn.type = 'button';
            emojiBtn.className = 'emoji-action-btn';
            emojiBtn.innerText = '😊';
            emojiBtn.title = 'React';
            emojiBtn.onclick = function(e) {
                e.stopPropagation();
                // Remove any open pickers
                let open = document.querySelector('.emoji-picker');
                if (open) open.remove();
                // Create picker
                let picker = document.createElement('div');
                picker.className = 'emoji-picker';
                emojiList.forEach(emoji => {
                    let btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerText = emoji;
                    btn.onclick = function(ev) {
                        ev.stopPropagation();
                        // Add/increment reaction
                        let reactions = messageReactions[idx] || {};
                        reactions[emoji] = (reactions[emoji] || 0) + 1;
                        messageReactions[idx] = reactions;
                        rerenderChat();
                    };
                    picker.appendChild(btn);
                });
                // Position picker
                emojiBtn.parentNode.appendChild(picker);
            };
            // Remove picker on click elsewhere
            document.addEventListener('click', function handler(e) {
                let open = document.querySelector('.emoji-picker');
                if (open && !open.contains(e.target)) {
                    open.remove();
                    document.removeEventListener('click', handler);
                }
            });
            // Compose message row
            let msgRow = document.createElement('div');
            msgRow.style.display = 'flex';
            msgRow.style.alignItems = 'center';
            msgRow.appendChild(msgDiv);
            msgRow.appendChild(emojiBtn);
            msgContainer.appendChild(msgRow);
            // Block reactions below message
            let reactionsBar = renderBlockReactions(idx);
            msgContainer.appendChild(reactionsBar);
            chatBox.appendChild(msgContainer);
        });
        if (messages.length === 0) updatePlaceholder();
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
    }
    let messages = [];

    // Fetch chat history before connecting to Socket.IO
    fetch('/messages')
        .then(res => res.json())
        .then(data => {
            messages = data;
            rerenderChat();
            // Now connect to Socket.IO
            socket = io();
            socket.on('receive_message', function(data) {
                let ph = chatBox.querySelector('.empty-placeholder');
                if (ph) ph.remove();
                messages.push(data);
                rerenderChat();
                // Play sound if not own message
                if (data.username !== myUsername) {
                    notifySound.play();
                }
            });
        });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (input.value) {
            socket.emit('send_message', { message: input.value });
            input.value = '';
            input.focus();
        }
    });

    // Dark mode toggle
    const darkToggle = document.createElement('button');
    darkToggle.className = 'btn btn-secondary btn-sm ms-2';
    darkToggle.innerText = '🌙';
    darkToggle.style.position = 'fixed';
    darkToggle.style.top = '20px';
    darkToggle.style.right = '20px';
    document.body.appendChild(darkToggle);
    darkToggle.onclick = function() {
        document.body.classList.toggle('dark-mode');
        chatBox.classList.toggle('dark-chat-box');
    };

    // Show loading spinner when scrolling to top
    chatBox.addEventListener('scroll', function() {
        if (chatBox.scrollTop === 0) {
            const loadingDiv = document.getElementById('chat-loading');
            loadingDiv.style.display = 'block';
            // Simulate loading delay
            setTimeout(() => {
                loadingDiv.style.display = 'none';
                // Here you would fetch older messages if implementing pagination
            }, 1000);
        }
    });
});