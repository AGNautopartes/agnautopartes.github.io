export const invokeApiHandler = async (handler, request) => {
    let statusCode = 200;
    let responseBody;
    const responseHeaders = new Map();

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(value) {
            responseBody = value;
            return this;
        },
        send(value) {
            responseBody = value;
            return this;
        },
        setHeader(name, value) {
            responseHeaders.set(String(name).toLowerCase(), value);
            return this;
        }
    };

    await handler({
        method: request.method,
        headers: request.headers || {},
        body: request.body || {},
        query: request.query || {}
    }, res);

    return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        body: responseBody,
        headers: Object.fromEntries(responseHeaders)
    };
};
