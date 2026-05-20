export function forceLoadHistory(onComplete) {
    let unchangedCount = 0;
    let previousChatCount = 0;
    
    function scrollStep() {
        const nativeLinks = Array.from(document.querySelectorAll('a[href*="/app/"], a[href*="/chat/"]'));
        const currentChats = nativeLinks.length;
        
        if (currentChats > previousChatCount) {
            unchangedCount = 0;
            previousChatCount = currentChats;
        } else {
            unchangedCount++;
        }

        if (unchangedCount > 10) {
            if (onComplete) onComplete();
            return;
        }

        if (nativeLinks.length > 0) {
            let el = nativeLinks[nativeLinks.length - 1];
            try { el.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e) {}
        }
        setTimeout(scrollStep, 800);
    }
    scrollStep();
}
