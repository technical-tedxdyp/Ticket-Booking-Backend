const validateBooking = (req, res, next) => {
    const { name, email, phone, sessions, ticketCount } = req.body;

    if (!name || name.trim().length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Name must be at least 2 characters',
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Valid email address is required',
        });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phone || !phoneRegex.test(phone)) {
        return res.status(400).json({
            success: false,
            message: 'Valid 10-digit Indian mobile number required',
        });
    }

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Select at least one session',
        });
    }

    const count = parseInt(ticketCount);
    if (!count || count < 1 || count > 5) {
        return res.status(400).json({
            success: false,
            message: 'Ticket count must be between 1 and 5',
        });
    }

    next();
};

export default validateBooking;
