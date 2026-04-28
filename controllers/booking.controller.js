import Event from '../models/event.model.js';
import Session from '../models/session.model.js';
import Booking from '../models/booking.model.js';
import { createOrder } from '../services/razorpay.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Create a new booking
// Flow: Input arrives -> ticket limit check -> sessions exist? -> seats available? -> calc amount -> create order
export const createBookingOrder = asyncHandler(async (req, res) => {
    const { name, email, phone, sessions, ticketCount } = req.body;
    const count = parseInt(ticketCount);
    const normalEmail = email.toLowerCase().trim();

    // --- Step 1: Ticket limit check ---
    const existing = await Booking.find({
        $or: [{ email: normalEmail }, { phone }],
        paymentStatus: 'paid',
    });
    const usedTickets = existing.reduce((sum, b) => sum + b.ticketCount, 0);
    if (usedTickets + count > 5) {
        return res.status(400).json({
            success: false,
            message: `You already have ${usedTickets} ticket(s). Max is 5 per person.`,
        });
    }

    // --- Step 2: Validate sessions exists and are active ---
    const sessionDocs = await Session.find({
        _id: { $in: sessions },
        isActive: true,
    });
    if (sessionDocs.length !== sessions.length) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected sessions are invalid or unavailable',
        });
    }

    // --- Step 3: Atomic seat reservation ---
    const event = await Event.findOneAndUpdate(
        { remainingSeats: { $gte: count }, isActive: true },
        { $inc: { soldTickets: count, remainingSeats: -count } },
        { new: true },
    );
    if (!event) {
        return res.status(400).json({
            success: false,
            message: 'Not enough seats available. Try a smaller ticket count.',
        });
    }

    // --- Step 4: Compute total amount server side ---
    const pricePerTicket = sessionDocs.reduce((sum, s) => sum + s.price, 0);
    const totalAmount = pricePerTicket * count;

    // --- Step 5: Create razorpay order ---
    let razorpayOrder;
    try {
        razorpayOrder = await createOrder(totalAmount, `tedx_${Date.now()}`);
    } catch (razorpayErr) {
        // Razorpay failed AFTER we decremented seats — rollback
        await Event.findOneAndUpdate({}, { $inc: { soldTickets: -count, remainingSeats: count } });
        throw razorpayErr;
    }

    // --- Step 6: Save pending booking ---
    const booking = await Booking.create({
        name: name.trim(),
        email: normalEmail,
        phone,
        sessions: sessionDocs.map((s) => s._id),
        ticketCount: count,
        totalAmount,
        razorpayOrderId: razorpayOrder.id,
    });

    res.status(201).json({
        success: true,
        data: {
            bookingId: booking._id,
            razorpayOrderId: razorpayOrder.id,
            amount: totalAmount,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
        },
    });
});
