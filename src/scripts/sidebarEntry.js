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
    if (document.getElementById('gpt-right-sidebar')) return true;

    try {
        const sidebarUrl = chrome.runtime.getURL('sidebar.html');
        const response = await fetch(sidebarUrl);
        
        if (!response.ok) throw new Error('File not found at asset root');
        
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
        console.error('File fetch failed, creating fall-back layout:', error);
        
        // Fall-back shell ensures features continue running if disk read fails
        const fallbackNode = document.createElement('div');
        fallbackNode.id = 'gpt-right-sidebar';
        fallbackNode.innerHTML = `
            <div class="gpt-tabs">
                <button class="gpt-tab-btn active" data-target="gpt-tab-org">Organise</button>
                <button class="gpt-tab-btn" data-target="gpt-tab-tools">Tools</button>
                <button class="gpt-tab-btn" data-target="gpt-tab-set">Settings</button>
            </div>
            <div id="gpt-tab-org" class="gpt-tab-content active">Panel loading...</div>
            <div id="gpt-tab-tools" class="gpt-tab-content">Panel loading...</div>
            <div id="gpt-tab-set" class="gpt-tab-content">Panel loading...</div>
        `;
        document.body.appendChild(fallbackNode);
        document.body.classList.add('gpt-sidebar-active');
        return true;
    }
    return false;
}

async function startRuntimeBridge() {
    activeEmail = await extractUserEmail();
    safeEmailKey = activeEmail.replace(/[@.]/g, '_');
    STORAGE_KEY = `gpt_workspace_settings_${safeEmailKey}`;
    BACKUP_KEY = `gpt_workspace_backups_${safeEmailKey}`;

    chrome.storage.local.get([STORAGE_KEY], async (localData) => {
        let localSettings = localData[STORAGE_KEY] || {};
        extensionSettings = { ...extensionSettings, ...localSettings };
        isDataLoaded = true;
        
        setupInteractions();
        initializeSystemHeartbeat();
        
        const injected = await injectSidebarDOM();
        if (injected) {
            bindTabNavigation();
            setupLocalStateListeners();
            console.log('Gemini Workspace Engine UI safely bridged via Astro.');
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
    renderFolders();
}

function renderFolders() {
    const folderList = document.getElementById('gpt-folder-list');
    if (!folderList) return;
    
    folderList.innerHTML = '';
    const folderNames = Object.keys(extensionSettings.folders || {});
    
    if (folderNames.length === 0) {
        folderList.innerHTML = '<p style="font-size: 0.85em; color: #64748b;">No folders created yet.</p>';
        return;
    }
    
    folderNames.forEach(folderName => {
        const folderEl = document.createElement('div');
        folderEl.style.cssText = 'display: flex; justify-content: space-between; padding: 8px; background: #1e293b; border-radius: 4px; align-items: center;';
        folderEl.innerHTML = `
            <span style="font-size: 0.9em; color: #f8fafc;">📁 ${folderName}</span>
            <button class="gpt-delete-folder" data-folder="${folderName}" style="background: transparent; border: none; color: #ef4444; cursor: pointer;">✕</button>
        `;
        folderList.appendChild(folderEl);
    });
    
    document.querySelectorAll('.gpt-delete-folder').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fname = e.currentTarget.dataset.folder;
            delete extensionSettings.folders[fname];
            saveSettingsState();
            renderFolders();
        });
    });
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
    setTimeout(() => {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            startRuntimeBridge();
        } else {
            document.addEventListener('DOMContentLoaded', startRuntimeBridge);
        }
    }, 1500);
}
