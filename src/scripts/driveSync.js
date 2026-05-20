export function saveToCloud(dataObj, accountId, activeEmail) {
    chrome.runtime.sendMessage({ 
        action: 'SAVE_TO_DRIVE', 
        data: dataObj, 
        accountId: accountId,
        email: activeEmail 
    }, (response) => {
        if (response && response.error) {
            console.error("GPT Tools Drive Sync Error:", response.error);
        }
    });
}

export function loadFromCloud(accountId, activeEmail, callback) {
    chrome.runtime.sendMessage({ 
        action: 'LOAD_FROM_DRIVE', 
        accountId: accountId,
        email: activeEmail 
    }, (response) => {
        if (response && response.success && response.data) {
            callback(response.data);
        } else {
            callback(null);
        }
    });
}
