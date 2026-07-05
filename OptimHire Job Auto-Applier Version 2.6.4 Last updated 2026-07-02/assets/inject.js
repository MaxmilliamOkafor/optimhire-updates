; (function () {
    if(window?.pageData) {
        // For Paylocity ATS: country and state data are pre-loaded in the window object
        window.postMessage(
            { type: "PAGE_DATA", payload: window.pageData || null },
            "*"
        );
    }
})()
