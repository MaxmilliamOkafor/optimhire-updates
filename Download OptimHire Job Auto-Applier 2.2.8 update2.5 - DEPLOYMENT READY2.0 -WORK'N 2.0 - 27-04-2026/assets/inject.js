; (function () {
    if(window?.pageData) {
        // For Paylocity ATS: country and state data are pre-loaded in the window object
        window.postMessage(
            { type: "PAGE_DATA", payload: window.pageData || null },
            "*"
        );
    }
})()


// run only paylocity site
if (location.hostname.includes("paylocity.com")) {
    const hideModalsInterval = setInterval(() => {
        try {
            const citrusModal = document.getElementById('0citrus-modal-wrapper');
            if (citrusModal) {
                console.log('Hiding modals...');
                const forceUploadModal = document.getElementById('forceUploadResumeModal');
                if (forceUploadModal) forceUploadModal.style.display = 'none';
                citrusModal.style.display = 'none';
                const backdrop = document.querySelector('div.backdrop');
                if (backdrop) backdrop.style.display = 'none';
                document.body.classList.remove('modal-open');
                clearInterval(hideModalsInterval);
            }
        } catch (e) {
            console.error('Error hiding Paylocity modals:', e);
            clearInterval(hideModalsInterval);
        }
    }, 500);
}