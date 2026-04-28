import 'dotenv/config';
import connectDB from '../config/db.js';
import Event from '../models/event.model.js';
import Session from '../models/session.model.js';

const seed = async () => {
    await connectDB();

    const existing = await Event.findOne();
    if (!existing) {
        await Event.create({ title: 'TEDx 2026', totalSeats: 350 });
        console.log('Event created');
    } else {
        console.log('Event already exists, skipping');
    }

    const count = await Session.countDocuments();
    if (count === 0) {
        await Session.insertMany([
            { title: 'Morning Session', speakers: ['Speaker 1', 'Speaker 2'], startTime: new Date('2026-01-01T10:00:00'), endTime: new Date('2026-01-01T11:00:00'), price: 500, maxSeats: 350 },
            { title: 'Evening Session', speakers: ['Speaker 1', 'Speaker 2'], startTime: new Date('2026-01-01T12:00:00'), endTime: new Date('2026-01-01T13:00:00'), price: 300, maxSeats: 350 },
        ]);
        console.log('Sessions seeded');
    }

    console.log('Done!');
    process.exit(0);
};

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
