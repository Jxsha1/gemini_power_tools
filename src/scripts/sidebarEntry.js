import { extractUserEmail } from './domScanner.js';
import { forceLoadHistory } from './historyScanner.js';
import { saveToCloud } from './driveSync.js';

let activeEmail = 'default@gmail.com';
let safeEmailKey = 'default_gmail_com';
let STORAGE_KEY = '';
let BACKUP_KEY = '';

let extensionSettings = {
    sidebarCollapsed: false,
    outputLanguage: '',
    naturalResponsesEnabled: false,
    cloudSyncEnabled: false,
    onboardingComplete: false,
    cloudAccountId: null,
    naturalResponseSettings: {
        style: 'flowing',
        noEmDashes: true,
        noSemicolons: true,
        noRoboticTransitions: true,
        noPreambles: true,
        noPostambles: true
    },
    prompts: [],
    folders: {},
    pinnedFolders: [],
    tags: {},
    tagColors: {},
    archives: []
};

let isDataLoaded = false;
let isModifyingDOM = false;
let currentActiveTagColor = '#4a90e2';
let hasAttemptedHistoryLoad = false;

async function injectSidebarDOM() {
    // Check if the sidebar already exists to prevent duplicate injections
    if (document.getElementById('gpt-right-sidebar')) return true;

    try {
        const sidebarUrl = chrome.runtime.getURL('sidebar.html');
        const response = await fetch(sidebarUrl);
        const htmlText = await response.text();
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = htmlText;
        
        const sidebarNode = wrapper.querySelector('#gpt-right-sidebar');
        if (sidebarNode) {
            document.body.appendChild(sidebarNode);
            document.body.classList.add('gpt-sidebar-active');
            return true;
        }
    } catch (error) {
        console.error('Failed to inject Gemini Workspace Tools layout panel:', error);
    }
    return false;
}

async function startRuntimeBridge() {
    // Core variable assignments must run first to prevent state blocking
    activeEmail = await extractUserEmail();
    safeEmailKey = activeEmail.replace(/[@.]/g, '_');
    STORAGE_KEY = `gpt_workspace_settings_${safeEmailKey}`;
    BACKUP_KEY = `gpt_workspace_backups_${safeEmailKey}`;

    chrome.storage.local.get([STORAGE_KEY], async (localData) => {
        let localSettings = localData[STORAGE_KEY] || {};
        extensionSettings = { ...extensionSettings, ...localSettings };
        isDataLoaded = true;
        
        // Initialise core background interactions and page interceptors
        setupInteractions();
        initializeSystemHeartbeat();
        
        // Attempt DOM injection safely without blocking history processes
        const injected = await injectSidebarDOM();
        if (injected) {
            bindTabNavigation();
            setupLocalStateListeners();
            console.log('Gemini Workspace Engine UI safely bridged via Astro.');
        } else {
            console.warn('UI injection delayed. Extension core runtime is still active.');
        }
    });
}

function bindTabNavigation() {
    const tabs = Array.from(document.querySelectorAll('.gpt-tab-btn'));
    tabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target;
            const innerTabs = Array.from(document.querySelectorAll('.gpt-tab-btn'));
            innerTabs.forEach(b => b.classList.remove('active'));
            
            const innerContents = Array.from(document.querySelectorAll('.gpt-tab-content'));
            innerContents.forEach(c => c.classList.remove('active'));
            
            targetBtn.classList.add('active');
            const targetContent = document.getElementById(targetBtn.dataset.target);
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

function setupLocalStateListeners() {
    const naturalToggle = document.getElementById('gpt-natural-toggle');
    if (naturalToggle) naturalToggle.checked = extensionSettings.naturalResponsesEnabled;

    const langSelect = document.getElementById('gpt-output-language');
    if (langSelect) langSelect.value = extensionSettings.outputLanguage || '';

    const syncToggle = document.getElementById('gpt-cloud-sync-toggle');
    if (syncToggle) syncToggle.checked = extensionSettings.cloudSyncEnabled;

    attachUIControls();
}

function attachUIControls() {
    const naturalToggle = document.getElementById('gpt-natural-toggle');
    if (naturalToggle) {
        naturalToggle.addEventListener('change', (e) => {
            const target = e.target;
            extensionSettings.naturalResponsesEnabled = target.checked;
            saveSettingsState();
        });
    }

    const langSelect = document.getElementById('gpt-output-language');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            const target = e.target;
            extensionSettings.outputLanguage = target.value;
            saveSettingsState();
        });
    }

    const syncToggle = document.getElementById('gpt-cloud-sync-toggle');
    if (syncToggle) {
        syncToggle.addEventListener('change', (e) => {
            const target = e.target;
            extensionSettings.cloudSyncEnabled = target.checked;
            saveSettingsState();
        });
    }

    const colorSwatches = Array.from(document.querySelectorAll('.gpt-colour-swatch'));
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            colorSwatches.forEach(s => s.classList.remove('selected'));
            const target = e.target;
            target.classList.add('selected');
            currentActiveTagColor = target.dataset.colour;
        });
    });
}

function saveSettingsState() {
    if (!isDataLoaded) return;
    const localSaveObj = {};
    localSaveObj[STORAGE_KEY] = extensionSettings;
    chrome.storage.local.set(localSaveObj, () => {
        if (extensionSettings.cloudSyncEnabled) {
            saveToCloud({ settings: extensionSettings, backups: [] }, extensionSettings.cloudAccountId, activeEmail);
        }
    });
}

function setupInteractions() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const inputBox = e.target.closest('rich-textarea, text-area, [aria-label*="Message"]');
            if (inputBox) appendSystemConstraints(inputBox);
        }
    }, true);
}

function appendSystemConstraints(inputBox) {
    if (!extensionSettings.naturalResponsesEnabled) return;
    const editable = inputBox.querySelector('[contenteditable="true"]') || inputBox;
    
    let instructions = [];
    const rules = extensionSettings.naturalResponseSettings;
    
    if (rules.noEmDashes) instructions.push("Do not use em dashes.");
    if (rules.noSemicolons) instructions.push("Avoid using semicolons completely.");
    if (rules.noRoboticTransitions) instructions.push("Do not use robotic transitions (e.g., 'In conclusion', 'Furthermore').");
    
    if (instructions.length === 0) return;
    
    const constraintBlock = `\n\n[Formatting constraints: ${instructions.join(' ')} Plain text only.]`;
    editable.appendChild(document.createTextNode(constraintBlock));
    editable.dispatchEvent(new Event('input', { bubbles: true }));
}

function initializeSystemHeartbeat() {
    setInterval(() => {
        if (!isDataLoaded || isModifyingDOM) return;
        
        // Ensure UI injection is re-verified periodically if first attempt was too early
        if (!document.getElementById('gpt-right-sidebar')) {
            injectSidebarDOM().then((success) => {
                if (success) {
                    bindTabNavigation();
                    setupLocalStateListeners();
                }
            });
        }

        const chatLinks = document.querySelectorAll('a[href*="/app/"], a[href*="/chat/"]');
        if (chatLinks.length > 0 && !hasAttemptedHistoryLoad) {
            hasAttemptedHistoryLoad = true;
            forceLoadHistory(() => {
                console.log('Past history segments aggregated securely.');
            });
        }
    }, 2000);
}

if (typeof window !== 'undefined') {
    startRuntimeBridge();
}