import { extractUserEmail } from './domScanner.js';
import { forceLoadHistory } from './historyScanner.js';
import { saveToCloud, loadFromCloud } from './driveSync.js';

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
let globalHarvestedChats = new Map();

async function startRuntimeBridge() {
    activeEmail = await extractUserEmail();
    safeEmailKey = activeEmail.replace(/[@.]/g, '_');
    STORAGE_KEY = `gpt_workspace_settings_${safeEmailKey}`;
    BACKUP_KEY = `gpt_workspace_backups_${safeEmailKey}`;

    chrome.storage.local.get([STORAGE_KEY], (localData) => {
        let localSettings = localData[STORAGE_KEY] || {};
        extensionSettings = { ...extensionSettings, ...localSettings };
        isDataLoaded = true;
        
        setupInteractions();
        console.log('Gemini Workspace Engine safely bridged via Astro.');
    });
}

function setupInteractions() {
    // Intercepts input actions on the native page layout
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

startRuntimeBridge();
