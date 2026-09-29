const serializeMeta = (value) => {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            ...(value.code !== undefined ? { code: value.code } : {}),
            ...(value.codeName !== undefined ? { codeName: value.codeName } : {}),
        };
    }

    if (Array.isArray(value)) {
        return value.map(serializeMeta);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeMeta(item)]));
    }

    return value;
};

const formatMessage = (level, message, meta) => {
    const timestamp = new Date().toISOString();
    if (!meta) {
        return `[${timestamp}] ${level}: ${message}`;
    }

    return `[${timestamp}] ${level}: ${message} ${typeof meta === 'string' ? meta : JSON.stringify(serializeMeta(meta))}`;
};

const logger = {
    info: (...args) => console.log(formatMessage('INFO', args[0], args.length > 1 ? args.slice(1) : undefined)),
    warn: (...args) => console.warn(formatMessage('WARN', args[0], args.length > 1 ? args.slice(1) : undefined)),
    error: (...args) => console.error(formatMessage('ERROR', args[0], args.length > 1 ? args.slice(1) : undefined)),
    debug: (...args) => console.debug(formatMessage('DEBUG', args[0], args.length > 1 ? args.slice(1) : undefined)),
};

export default logger;
