// Initialize Lucide icons
lucide.createIcons();

// Elements
const body = document.body;
const aiInput = document.getElementById('aiInput');
const chatHistory = document.getElementById('chatHistory');
const chatForm = document.getElementById('chatForm');

// Top Navbar
const focusMode = document.getElementById('focusMode');
const proMode = document.getElementById('proMode');

// Profile & Library
const avatarBtn = document.getElementById('avatarBtn');
const profileDropdown = document.getElementById('profileDropdown');
const newChatDropdownBtn = document.getElementById('newChatDropdownBtn');
const logoutBtn = document.getElementById('logoutBtn');
const historyList = document.getElementById('historyList');

// Bottom controls
const focusBtn = document.getElementById('focusBtn');
const proBtn = document.getElementById('proBtn');
const micBtn = document.getElementById('micBtn');
const plusBtn = document.querySelector('.plus-btn');
const fileInput = document.getElementById('fileInput');
const mediaPreview = document.getElementById('mediaPreview');
const modelPill = document.getElementById('modelPill');
const modelDropdown = document.getElementById('modelDropdown');

// Settings
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.querySelector('.close-modal');
const tempSlider = document.getElementById('tempSlider');
const tempValue = document.getElementById('tempValue');
const tokenSlider = document.getElementById('tokenSlider');
const tokenValue = document.getElementById('tokenValue');

// State
let isChatting = false;
let attachedFile = null;
let activeMode = null;
let topBarMode = 'focus'; 
let currentSettings = { temperature: 0.7, maxTokens: 4000, model: 'gemini-1.5-flash-latest' };
let chatLog = [];

// Chips
const chips = {
    factCheck: document.getElementById('factCheckChip'),
    research: document.getElementById('researchChip'),
    recommend: document.getElementById('recommendChip')
};

// HISTORY LOGIC
function addToHistory(title) {
    if (!title || chatLog.find(h => h.title === title)) return;
    chatLog.unshift({ title, time: new Date().toLocaleTimeString() });
    if (chatLog.length > 5) chatLog.pop();
    renderHistory();
}

function renderHistory() {
    if (!historyList) return;
    if (chatLog.length === 0) { 
        historyList.innerHTML = '<div class="history-empty">No recent prompts</div>'; 
        return; 
    }
    historyList.innerHTML = chatLog.map(h => `
        <div class="history-item" onclick="loadHistoryItem('${h.title}')">
            <i data-lucide="message-square" style="width:14px; height:14px; margin-right:8px; opacity:0.6;"></i>
            ${h.title.substring(0, 22)}${h.title.length > 22 ? '...' : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

window.loadHistoryItem = (t) => { 
    aiInput.value = t;
    aiInput.focus();
    profileDropdown.style.display = 'none'; 
};

// MENUS
const toggleMenu = (menu) => {
    if (!menu) return;
    const isShowing = menu.style.display === 'block';
    profileDropdown.style.display = 'none';
    modelDropdown.style.display = 'none';
    if (!isShowing) { 
        if (menu === profileDropdown) renderHistory(); 
        menu.style.display = 'block'; 
    }
};

// SHARED ACTIONS
async function resetChat() {
    chatHistory.innerHTML = ''; 
    body.classList.remove('is-chatting'); 
    isChatting = false;
    aiInput.value = '';
    aiInput.focus();
    await fetch('/api/reset', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ session_id: 'default_user' }) 
    });
}

const toBase64 = f => new Promise((v, j) => {
    const r = new FileReader(); r.readAsDataURL(f);
    r.onload = () => v(r.result.split(',')[1]); r.onerror = e => j(e);
});

function addMessageToUI(r, t, loading = false) {
    const id = Date.now();
    const d = document.createElement('div'); d.className = `message ${r}-message`; d.id = `msg-${id}`;
    if (r === 'ai') {
        d.innerHTML = `<div class="ai-icon"><i data-lucide="sparkles"></i></div><div class="message-content">${loading ? '<p>Processing...</p>' : marked.parse(t)}</div>`;
    } else {
        d.innerHTML = `<div class="message-content">${t}</div>`;
    }
    chatHistory.appendChild(d);
    lucide.createIcons();
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return `msg-${id}`;
}

function updateAIMessage(id, t) {
    const d = document.getElementById(id); if (!d) return;
    const c = d.querySelector('.message-content');
    c.innerHTML = marked.parse(t);
    c.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function handleSendMessage() {
    let message = aiInput.value.trim();
    if (!message && !attachedFile) return;

    if (!isChatting) { 
        body.classList.add('is-chatting'); 
        isChatting = true; 
        addToHistory(message || "Media Topic"); 
    }

    let sysCmd = topBarMode === 'pro' ? "[PRO MODE: Detailed Reasoning] " : "[FOCUS MODE: Concise Genius] ";
    if (activeMode) sysCmd += `[MODE: ${activeMode.toUpperCase()}] `;

    const displayM = (activeMode ? `**(${activeMode.toUpperCase()})** ` : "") + (message || "Visual Analysis...");
    addMessageToUI('user', displayM + (attachedFile ? `\n\n*(File: ${attachedFile.name})*` : ''));
    
    aiInput.value = '';
    const currentF = attachedFile; attachedFile = null; mediaPreview.style.display = 'none';
    const loadingId = addMessageToUI('ai', 'Thinking...', true);

    try {
        let fileD = null;
        if (currentF) fileD = await toBase64(currentF);
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: sysCmd + message, settings: currentSettings, file: fileD ? { name: currentF.name, mime_type: currentF.type, data: fileD } : null }),
        });
        const data = await res.json();
        if (data.status === 'success') { 
            updateAIMessage(loadingId, data.response); 
        } else { 
            updateAIMessage(loadingId, "Error: " + (data.error || "Recall Failure")); 
        }
    } catch (e) { updateAIMessage(loadingId, "Connection error."); }
}

// EVENT LISTENERS
function initEventListeners() {
    // Dropdown Toggles
    avatarBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(profileDropdown); };
    modelPill.onclick = (e) => { e.stopPropagation(); toggleMenu(modelDropdown); };
    
    // Dropdown Actions
    newChatDropdownBtn.onclick = (e) => { e.stopPropagation(); resetChat(); profileDropdown.style.display = 'none'; };
    settingsBtn.onclick = (e) => { e.stopPropagation(); settingsModal.style.display = 'flex'; profileDropdown.style.display = 'none'; };
    logoutBtn.onclick = (e) => { e.stopPropagation(); alert("Signing out..."); location.reload(); };

    // Mode Buttons
    focusBtn.onclick = (e) => { e.stopPropagation(); focusMode.click(); };
    proBtn.onclick = (e) => { e.stopPropagation(); proMode.click(); };

    window.onclick = () => { 
        profileDropdown.style.display = 'none'; 
        modelDropdown.style.display = 'none'; 
    };

    // Model Selection logic
    document.querySelectorAll('#modelDropdown .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const model = item.getAttribute('data-model');
            currentSettings.model = model;
            modelPill.innerHTML = `${item.innerText} <i data-lucide="chevron-down" style="width: 14px; height: 14px; margin-left: 4px;"></i>`;
            lucide.createIcons();
            modelDropdown.style.display = 'none';
        });
    });

    // Voice recognition
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.onstart = () => { micBtn.classList.add('mic-active'); };
        recognition.onend = () => { micBtn.classList.remove('mic-active'); };
        recognition.onresult = (e) => { aiInput.value = e.results[0][0].transcript; aiInput.focus(); };
        micBtn.onclick = (e) => { e.preventDefault(); try { recognition.start(); } catch (err) { recognition.stop(); } };
    }

    // Top Nav Handlers
    focusMode.onclick = () => { 
        focusMode.classList.add('active'); proMode.classList.remove('active'); topBarMode = 'focus'; 
        focusBtn.classList.add('active-action'); proBtn.classList.remove('active-action');
        currentSettings.model = 'gemini-1.5-flash-latest';
        modelPill.innerHTML = `Models <i data-lucide="chevron-down" style="width: 14px; height: 14px; margin-left: 4px;"></i>`;
        lucide.createIcons();
    };
    proMode.onclick = () => { 
        proMode.classList.add('active'); focusMode.classList.remove('active'); topBarMode = 'pro'; 
        proBtn.classList.add('active-action'); focusBtn.classList.remove('active-action');
        currentSettings.model = 'gemini-1.5-pro-latest';
        modelPill.innerHTML = `Flash + Pro <i data-lucide="chevron-down" style="width: 14px; height: 14px; margin-left: 4px;"></i>`;
        lucide.createIcons();
    };

    // Chips
    Object.keys(chips).forEach(m => {
        chips[m].onclick = () => {
            if (activeMode === m) { chips[m].classList.remove('active'); activeMode = null; }
            else { Object.values(chips).forEach(c => c.classList.remove('active')); chips[m].classList.add('active'); activeMode = m; }
        };
    });

    // Form submission
    chatForm.onsubmit = (e) => { e.preventDefault(); handleSendMessage(); };
    
    // File uploads
    plusBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            attachedFile = file;
            mediaPreview.innerHTML = `<div class="preview-item"><i data-lucide="file-text"></i><span>${file.name}</span><span class="remove-btn">&times;</span></div>`;
            mediaPreview.style.display = 'flex';
            lucide.createIcons();
            mediaPreview.querySelector('.remove-btn').onclick = () => { attachedFile = null; mediaPreview.style.display = 'none'; fileInput.value = ''; };
        }
    };
    
    // Settings modal
    tempSlider.oninput = () => { currentSettings.temperature = parseFloat(tempSlider.value); tempValue.innerText = tempSlider.value; };
    tokenSlider.oninput = () => { currentSettings.maxTokens = parseInt(tokenSlider.value); tokenValue.innerText = tokenSlider.value; };
    closeModal.onclick = () => settingsModal.style.display = 'none';
}

window.onload = () => { 
    initEventListeners();
    renderHistory(); 
    focusBtn.classList.add('active-action'); 
    aiInput.focus();
};
