const errorHandler = (err, req, res, next) => {
    console.error('Error: ', err);

    // If it's our custom error
    if (err instanceof Error && err.statusCode) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map((e) => e.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', '),
        });
    }

    // Duplicate key error (MongoDB)
    if (err.code === 11000) {
        return res.status(400).json({
            success: false,
            message: 'Duplicate field value entered',
        });
    }

    // Fallback
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
};

export default errorHandler;
