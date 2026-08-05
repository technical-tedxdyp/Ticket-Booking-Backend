export const successResponse = (res, statusCode, message, data = null, meta = null) => {
    const response = {
        success: true,
        message,
    };
    
    if (data !== null && data !== undefined) {
        response.data = data;
    }
    
    if (meta !== null && meta !== undefined) {
        response.meta = meta;
    }

    return res.status(statusCode).json(response);
};

export const errorResponse = (res, statusCode, message, errors = null) => {
    const response = {
        success: false,
        message,
    };

    if (errors !== null && errors !== undefined) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};
