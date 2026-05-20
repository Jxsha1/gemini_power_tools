export async function extractUserEmail() {
    const pathPrefix = window.location.pathname.startsWith('/u/') ? window.location.pathname.substring(0, 4) : '/default';
    const cacheKey = 'gpt_email_mapping_' + pathPrefix;
    const cachedEmail = localStorage.getItem(cacheKey);
    
    if (cachedEmail && cachedEmail.includes('@')) {
        return cachedEmail;
    }

    return new Promise((resolve) => {
        let attempts = 0;
        const checkDom = async () => {
            try {
                const matchEmail = (text) => {
                    if (!text) return null;
                    const m = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                    return m ? m[1] : null;
                };

                const allElements = document.querySelectorAll('a[aria-label], img[alt], [title]');
                for (const el of Array.from(allElements)) {
                    const email = matchEmail(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt'));
                    if (email) {
                        localStorage.setItem(cacheKey, email);
                        return resolve(email);
                    }
                }
            } catch (e) {
                console.error("GPT Tools Extraction Error", e);
            }

            attempts++;
            if (attempts > 30) {
                resolve('default@gmail.com');
            } else {
                setTimeout(checkDom, 200);
            }
        };
        checkDom();
    });
}
