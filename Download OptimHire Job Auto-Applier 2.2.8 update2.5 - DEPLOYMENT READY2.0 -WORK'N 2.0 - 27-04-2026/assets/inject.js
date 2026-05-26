; (function () {
    // const TARGET =    "https://www.ziprecruiter.com/api/apply/apply.engine.proto.v1beta1.API/SubmitApplication"
    const getApiWebRequest = () => localStorage.getItem('apiWebRequest');
    // ---------- fetch ----------
    const originalFetch = window.fetch
    window.fetch = function (...args) {
        const [input] = args
        const url = typeof input === "string" ? input : input.url;
        if (url == getApiWebRequest() && getApiWebRequest()) {
            window.postMessage(
                { type: "SUCCESS_NETWORK" },
                "*"
            )
        }

        return originalFetch.apply(this, args)
    }

    // ---------- XHR ----------
    const open = XMLHttpRequest.prototype.open
    const send = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (method, url) {
        this._method = method
        this._url = url
        return open.apply(this, arguments)
    }

    XMLHttpRequest.prototype.send = function () {
        if (this._url == getApiWebRequest() && getApiWebRequest()) {
            window.postMessage(
                { type: "SUCCESS_NETWORK" },
                "*"
            )
        }

        return send.apply(this, arguments)
    }
})()
