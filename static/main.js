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

    // Music player variables
    var currentAudio = null;
    var musicEnabled = true;

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

            // Music player Socket.IO events
            socket.on('music_started', function(data) {
                console.log('Music started:', data.song);
                playMusic(data.song);
                updateMusicUI(data.song, true);
            });

            socket.on('music_stopped', function(data) {
                console.log('Music stopped:', data.message);
                stopMusic();
                updateMusicUI(null, false);
            });

            socket.on('music_queue_updated', function(data) {
                console.log('Queue updated:', data);
                updateQueueUI(data.queue, data.current_song);
            });

            socket.on('music_request_success', function(data) {
                console.log('Music request success:', data);
                showNotification(data.message, 'success');
            });

            socket.on('music_error', function(data) {
                console.log('Music error:', data);
                showNotification(data.message, 'error');
            });

            socket.on('music_skipped', function(data) {
                console.log('Music skipped:', data);
                showNotification(data.message, 'info');
            });

            socket.on('music_status', function(data) {
                console.log('Music status received:', data);
                updateMusicUI(data.current_song, data.is_playing);
                updateQueueUI(data.queue, data.current_song);
                if (data.current_song && data.is_playing) {
                    playMusic(data.current_song);
                }
            });

            // Get initial music status
            socket.emit('get_music_status');
        });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (input.value) {
            socket.emit('send_message', { message: input.value });
            input.value = '';
            input.focus();
        }
    });

    // Music player functions
    function playMusic(song) {
        if (!musicEnabled) return;
        
        stopMusic();
        console.log('Starting to play:', song.title, 'from URL:', song.url);
        
        // Check if it's a YouTube URL
        if (song.url.includes('youtube.com') || song.url.includes('youtu.be')) {
            playYouTubeMusic(song);
        } else {
            playDirectAudio(song);
        }
    }

    function playYouTubeMusic(song) {
        // Create a hidden iframe for YouTube audio
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        
        // Convert YouTube URL to embed format
        let videoId = song.url.split('v=')[1];
        if (videoId) {
            videoId = videoId.split('&')[0]; // Remove any additional parameters
        }
        
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&cc_load_policy=0&start=0&end=${song.duration}`;
        
        // Store reference to current audio element
        currentAudio = iframe;
        
        // Add to page
        document.body.appendChild(iframe);
        
        // Auto-remove after song duration
        setTimeout(() => {
            if (iframe.parentNode) {
                iframe.remove();
            }
            currentAudio = null;
        }, song.duration * 1000);
        
        console.log('YouTube music started:', song.title);
    }

    function playDirectAudio(song) {
        currentAudio = new Audio();
        currentAudio.src = song.url;
        currentAudio.volume = 0.3;
        currentAudio.preload = 'auto';
        
        // Add event listeners for better error handling
        currentAudio.addEventListener('loadstart', () => {
            console.log('Audio loading started');
        });
        
        currentAudio.addEventListener('canplay', () => {
            console.log('Audio can start playing');
            currentAudio.play().catch(e => {
                console.error('Error playing music:', e);
                showNotification('Error playing audio. Please try another song.', 'error');
            });
        });
        
        currentAudio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            showNotification('Error loading audio. Please try another song.', 'error');
        });
        
        currentAudio.addEventListener('ended', () => {
            console.log('Audio ended naturally');
            currentAudio = null;
        });
        
        // Try to load the audio
        currentAudio.load();
    }

    function stopMusic() {
        if (currentAudio) {
            if (currentAudio.tagName === 'IFRAME') {
                // Stop YouTube iframe
                currentAudio.remove();
            } else {
                // Stop direct audio
                currentAudio.pause();
                currentAudio.src = '';
            }
            currentAudio = null;
            console.log('Music stopped');
        }
    }

    function updateMusicUI(song, isPlaying) {
        const currentSongDiv = document.getElementById('current-song');
        const skipBtn = document.getElementById('skip-btn');
        const songTitle = document.getElementById('song-title');
        const songRequester = document.getElementById('song-requester');

        if (song && isPlaying) {
            currentSongDiv.style.display = 'block';
            skipBtn.style.display = 'inline-block';
            songTitle.textContent = song.title;
            songRequester.textContent = song.requested_by;
        } else {
            currentSongDiv.style.display = 'none';
            skipBtn.style.display = 'none';
        }
    }

    function updateQueueUI(queue, currentSong) {
        const queueInfo = document.getElementById('queue-info');
        const queueCount = document.getElementById('queue-count');
        
        if (queue && queue.length > 0) {
            queueInfo.style.display = 'block';
            queueCount.textContent = queue.length;
        } else {
            queueInfo.style.display = 'none';
        }
    }

    function showNotification(message, type) {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show`;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '9999';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    // Music player UI controls
    document.getElementById('request-song-btn').addEventListener('click', function() {
        const songSelect = document.getElementById('song-select');
        const selectedSong = songSelect.value;
        
        if (selectedSong) {
            socket.emit('request_music', { song_id: selectedSong });
            songSelect.value = '';
        } else {
            showNotification('Please select a song first', 'error');
        }
    });

    document.getElementById('skip-btn').addEventListener('click', function() {
        socket.emit('skip_song');
    });

    document.getElementById('music-toggle').addEventListener('click', function() {
        musicEnabled = !musicEnabled;
        const btn = this;
        
        if (musicEnabled) {
            btn.textContent = '🔊';
            btn.className = 'btn btn-light btn-sm';
            showNotification('Music enabled', 'success');
        } else {
            btn.textContent = '🔇';
            btn.className = 'btn btn-secondary btn-sm';
            stopMusic();
            showNotification('Music disabled', 'info');
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