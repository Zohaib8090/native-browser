
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const summarizeBtn = document.getElementById('summarizeBtn');
const clearBtn = document.getElementById('clearBtn');
const closeBtn = document.getElementById('closeBtn');

let engine = null;
let currentProvider = 'webgpu'; // 'webgpu' or 'ollama'
let isGenerating = false;
let history = []; // Chat history

// --- Initialization ---
function init() {
    // Load theme setting from parent if possible (via basic checks or just default)
    // For now defaults to dark.

    setupEventListeners();
    updateProviderInfo();
}

// --- Logic ---

function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = '24px';
    });

    modelSelect.addEventListener('change', () => {
        updateProviderInfo();
        if (engine) unloadModel(); // Unload when changing selection manually too
    });

    clearBtn.addEventListener('click', () => {
        chatContainer.innerHTML = '';
        history = [];
        addSystemMessage('Chat cleared.');
        if (engine) unloadModel(); // Clearing chat also frees memory
    });

    summarizeBtn.addEventListener('click', requestPageSummary);
    closeBtn.addEventListener('click', () => {
        // Send message to parent to close sidebar
        window.parent.postMessage({ type: 'close-ai-sidebar' }, '*');
        // Optional: auto-unload on close? Let's leave it to timer or manual to avoid reloading annoyance
    });

    // Listen for messages from parent (for context/summary)
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'page-content') {
            const content = event.data.text;
            chatInput.value = `Please summarize the following content:\n\n${content.substring(0, 5000)}...`; // Limit content
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
        }
    });
}

function updateProviderInfo() {
    const val = modelSelect.value;
    if (val.startsWith('ollama:')) {
        currentProvider = 'ollama';
    } else {
        currentProvider = 'webgpu';
    }
    console.log(`Provider: ${currentProvider}, Model: ${val}`);
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating) return;

    // UI Updates
    addMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = '24px';
    isGenerating = true;
    sendBtn.disabled = true;

    // Create AI bubble
    const aiBubbleId = addMessage('ai', '<span class="typing">Thinking...</span>');

    try {
        if (currentProvider === 'webgpu') {
            await handleWebGPUMessage(text, aiBubbleId);
        } else {
            await handleOllamaMessage(text, aiBubbleId);
        }
    } catch (e) {
        updateMessage(aiBubbleId, `Error: ${e.message}`);
    } finally {
        isGenerating = false;
        sendBtn.disabled = false;
    }
}

// --- Memor Management ---
async function unloadModel() {
    if (engine) {
        updateMessage('system', 'Unloading model to free memory...');
        try {
            await engine.unload();
            engine = null;
            addSystemMessage('Model unloaded from GPU memory.');
        } catch (e) {
            console.error('Failed to unload:', e);
        }
    }
}

// Auto-unload timer
let unloadTimer = null;
function resetUnloadTimer() {
    if (unloadTimer) clearTimeout(unloadTimer);
    // Unload after 10 minutes of inactivity to save memory
    unloadTimer = setTimeout(() => {
        if (currentProvider === 'webgpu' && engine) {
            unloadModel();
        }
    }, 10 * 60 * 1000);
}

// --- WebGPU Handler ---
async function handleWebGPUMessage(text, bubbleId) {
    resetUnloadTimer(); // Reset timer on activity
    const selectedModel = modelSelect.value;

    // Initialize Engine if needed or if model changed
    if (!engine || engine.selectedModel !== selectedModel) {
        if (engine) {
            await engine.unload(); // Unload previous if exists
        }

        updateMessage(bubbleId, 'Loading WebGPU model... (This may take a while significantly for first run)');
        try {
            engine = await CreateMLCEngine(selectedModel, {
                initProgressCallback: (report) => {
                    updateMessage(bubbleId, `Loading: ${report.text}`);
                }
            });
            engine.selectedModel = selectedModel;
        } catch (e) {
            throw new Error(`Failed to load model: ${e.message}. Ensure WebGPU is supported.`);
        }
    }

    // Prepare History (Limit context to last 10 messages for memory)
    const limitedHistory = history.slice(-10);
    const messages = [
        { role: "system", content: "You are a helpful AI assistant running in a web browser." },
        ...limitedHistory,
        { role: "user", content: text }
    ];

    // Generate
    let responseText = "";
    try {
        const chunks = await engine.chat.completions.create({
            messages,
            stream: true,
        });

        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            responseText += content;
            updateMessage(bubbleId, marked.parse(responseText));
        }
    } catch (e) {
        throw e;
    }

    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: responseText });
}

// --- Ollama Handler ---
async function handleOllamaMessage(text, bubbleId) {
    let model = modelSelect.value.replace('ollama:', '');
    if (model === 'custom') {
        model = prompt('Enter exact Ollama model name (e.g. "llama3"):') || 'llama3';
    }

    const messages = [
        ...history,
        { role: "user", content: text }
    ];

    try {
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false // Streaming is better but keeping simple fetch for now
            })
        });

        if (!response.ok) {
            throw new Error('Could not connect to Ollama. Is it running on port 11434?');
        }

        const data = await response.json();
        const reply = data.message.content;

        updateMessage(bubbleId, marked.parse(reply));
        history.push({ role: "user", content: text });
        history.push({ role: "assistant", content: reply });

    } catch (e) {
        throw e;
    }
}


// --- UI Helpers ---
function addMessage(role, html) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.id = `msg-${Date.now()}`;
    div.innerHTML = html;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return div.id;
}

function updateMessage(id, html) {
    const div = document.getElementById(id);
    if (div) {
        div.innerHTML = html;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function addSystemMessage(text) {
    addMessage('system', text);
}

function requestPageSummary() {
    window.parent.postMessage({ type: 'request-page-content' }, '*');
}

init();
