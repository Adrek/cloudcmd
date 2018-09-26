'use strict';

const currify = require('currify');
const wraptile = require('wraptile');
const squad = require('squad');
const fullstore = require('fullstore');

const io = require('socket.io-client');
const forEachKey = currify(require('for-each-key'));

const config = require('../config');
const log = require('./log');

const importStr = log.importStr;
const connectedStr = log.connectedStr;
const disconnectedStr = log.disconnectedStr;
const tokenRejectedStr = log.tokenRejectedStr;
const authTryStr = log.authTryStr;

const makeColor = log.makeColor;
const stringToRGB = log.stringToRGB;
const getMessage = log.getMessage;
const getDescription = log.getDescription;
const logWraped = log.logWraped;

const equal = (a, b) => `${a}=${b}`;
const append = currify((obj, a, b) => obj.value += b && equal(a, b) + '&');
const wrapApply = (f, disconnect) => (status) => () => f(null, {
    status,
    disconnect,
});

const closeIfNot = wraptile((socket, is) => !is && socket.close());
const addUrl = currify((url, a) => `${url}: ${a}`);

const getColorUrl = (url, name) => {
    if (!name)
        return url;
    
    return makeColor(url, stringToRGB(name));
};

const rmListeners = wraptile((socket, listeners) => {
    socket.removeListener('connect', listeners.onConnect);
    socket.removeListener('config', listeners.onConfig);
    socket.removeListener('error', listeners.onError);
    socket.removeListener('connection_error', listeners.onError);
});

const canceled = (f) => f(null, {
    status: 'canceled',
    disconnect: () => {},
});

const done = wraptile((fn, store) => fn(null, {
    status: store()
}));

const emitAuth = wraptile((importUrl, socket) => {
    log(importStr, `${authTryStr} to ${importUrl}`);
    socket.emit('auth', config('importToken'));
});

const apply = (fn, args) => fn.apply(null, args);

module.exports = (options, fn) => {
    fn = fn || options;
    
    if (!config('import'))
        return canceled(fn);
    
    const importUrl = config('importUrl');
    const importListen = config('importListen');
    const name = config('name');
    const port = config('port');
    
    const query = toLine({
        name,
        port,
    });
    
    const url = `${importUrl}/distribute?${query}`;
    const socket = io.connect(url, {
        ...options,
        rejectUnauthorized: false,
    });
    
    const superFn = wrapApply(fn, socket.close.bind(socket));
    const colorUrl = getColorUrl(importUrl, name);
    const close = closeIfNot(socket, importListen);
    
    const statusStore = fullstore();
    const statusStoreWraped = wraptile(statusStore);
    
    const onConfig = apply(squad, [
        close,
        logWraped(importStr, `config received from ${colorUrl}`),
        statusStoreWraped('received'),
        forEachKey(config),
    ]);
    
    const onError = apply(squad, [
        superFn('error'),
        logWraped(importStr),
        addUrl(colorUrl),
        getMessage,
    ]);
    
    const onConnectError = apply(squad, [
        superFn('connect_error'),
        logWraped(importStr),
        addUrl(colorUrl),
        getDescription,
    ]);
    
    const onConnect = emitAuth(importUrl, socket);
    const onAccept = logWraped(importStr,`${connectedStr} to ${colorUrl}`);
    const onDisconnect = apply(squad, [
        done(fn, statusStore),
        logWraped(importStr, `${disconnectedStr} from ${colorUrl}`),
        rmListeners(socket, {
            onError,
            onConnect,
            onConfig,
        }),
    ]);
    
    const onChange = squad(logWraped(importStr), config);
    const onReject = squad(superFn('reject'), logWraped(importStr, tokenRejectedStr));
    
    socket.on('connect', onConnect);
    socket.on('accept', onAccept);
    socket.on('disconnect', onDisconnect);
    socket.on('config', onConfig);
    socket.on('error', onError);
    socket.on('connect_error', onConnectError);
    socket.on('reject', onReject);
    
    if (config('importListen'))
        socket.on('change', onChange);
};

function toLine(obj) {
    const result = {
        value: '',
    };
    
    forEachKey(append(result), obj);
    
    const start = 0;
    const end = 1;
    const backward = -1;
    
    return result.value.slice(start, backward * end);
}
