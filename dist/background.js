chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FORCE_AUTH') {
        handleForceAuth(request.targetEmail)
            .then(data => sendResponse({ success: true, ...data }))
            .catch(err => sendResponse({ success: false, error: err }));
        return true;
    }
    if (request.action === 'SAVE_TO_DRIVE') {
        saveToDrive(request.data, request.accountId, request.email).then(sendResponse);
        return true;
    }
    if (request.action === 'LOAD_FROM_DRIVE') {
        loadFromDrive(request.accountId, request.email).then(sendResponse);
        return true;
    }
});

async function getAccountIdForEmail(targetEmail) {
    if (!targetEmail) return null;
    return new Promise((resolve) => {
        if (!chrome.identity.getAccounts) return resolve(null);

        chrome.identity.getAccounts(async (accounts) => {
            if (!accounts || accounts.length === 0) return resolve(null);

            for (let acc of accounts) {
                try {
                    const token = await new Promise((res) => {
                        chrome.identity.getAuthToken({ account: acc, interactive: false }, (t) => res(t));
                    });
                    if (token) {
                        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (response.ok) {
                            const userInfo = await response.json();
                            if (userInfo.email && userInfo.email.toLowerCase() === targetEmail.toLowerCase()) {
                                return resolve(acc.id);
                            }
                        }
                    }
                } catch (e) {}
            }
            resolve(null);
        });
    });
}

async function handleForceAuth(targetEmail) {
    let accountId = await getAccountIdForEmail(targetEmail);

    return new Promise((resolve, reject) => {
        let authParams = { interactive: true };
        if (accountId) {
            authParams.account = { id: accountId };
        }

        chrome.identity.getAuthToken(authParams, async (token) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError.message);
            }
            if (!token) {
                return reject("No token returned.");
            }

            try {
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const userInfo = await response.json();
                let finalAccountId = accountId;

                if (!finalAccountId) {
                    finalAccountId = await getAccountIdForEmail(userInfo.email);
                }

                resolve({ token: token, accountId: finalAccountId, email: userInfo.email });
            } catch (e) {
                resolve({ token: token, accountId: accountId, email: targetEmail });
            }
        });
    });
}

async function getAuthTokenForAccount(accountId, interactiveAuth) {
    return new Promise((resolve, reject) => {
        let params = { interactive: interactiveAuth };
        if (accountId) {
            params.account = { id: accountId };
        }

        chrome.identity.getAuthToken(params, (token) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            } else if (!token) {
                reject("No token returned by Google.");
            } else {
                resolve(token);
            }
        });
    });
}

async function findBackupFileId(token, email) {
    const safeEmail = email ? email.replace(/[^a-zA-Z0-9@.-]/g, '_') : 'default';
    const targetName = `Gemini_Workspace_Backup_${safeEmail}.json`;
    const query = encodeURIComponent(`name='${targetName}' and trashed=false`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function saveToDrive(workspaceData, accountId, email) {
    try {
        const token = await getAuthTokenForAccount(accountId, false);
        let fileId = await findBackupFileId(token, email);
        
        const safeEmail = email ? email.replace(/[^a-zA-Z0-9@.-]/g, '_') : 'default';
        const targetName = `Gemini_Workspace_Backup_${safeEmail}.json`;
        
        if (!fileId) {
            const metadata = {
                name: targetName,
                mimeType: 'application/json'
            };
            const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metadata)
            });
            const createData = await createResponse.json();
            fileId = createData.id;
        }
        
        const fileContent = JSON.stringify(workspaceData);
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: fileContent
        });
        
        return { success: true };
    } catch (e) {
        console.error("Save to Drive Error:", e);
        return { success: false, error: e.toString() };
    }
}

async function loadFromDrive(accountId, email) {
    try {
        const token = await getAuthTokenForAccount(accountId, false);
        const fileId = await findBackupFileId(token, email);
        
        if (!fileId) {
            return { success: false, error: 'No backup file found.' };
        }
        
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return { success: true, data: data };
    } catch (e) {
        console.error("Load from Drive Error:", e);
        return { success: false, error: e.toString() };
    }
}