import 'dotenv/config';

import connectDB from '../config/db.js';
import Event from '../models/event.model.js';
import Session from '../models/session.model.js';

const seed = async () => {
    try {
        await connectDB();

        console.log('🌱 Seeding database...');

        // Clear existing data
        await Session.deleteMany({});
        await Event.deleteMany({});

        // Create Event
        const event = await Event.create({
            title: 'TEDx DY Patil 2026',
            venue: 'DY Patil College of Engineering, Pune',
            description: 'TEDx event featuring inspiring speakers, innovators, entrepreneurs and creators.',
            startDate: new Date('2026-10-06'),
            endDate: new Date('2026-10-06'),
            isActive: true,
        });

        console.log('✅ Event Created');

        // Create Sessions
        const sessions = [
            {
                event: event._id,
                day: 1,
                title: 'Morning Session',
                description: 'Opening keynote followed by innovation-focused TEDx talks.',
                speakers: ['Speaker 1', 'Speaker 2', 'Speaker 3'],
                startTime: new Date('2026-10-06T10:00:00'),
                endTime: new Date('2026-10-06T13:00:00'),
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                price: 500,
                isActive: true,
            },
            {
                event: event._id,
                day: 1,
                title: 'Technology & Startup Session',
                description: 'Technology, AI and Startup related TEDx talks.',
                speakers: ['Speaker 3', 'Speaker 4', 'Speaker 5'],
                startTime: new Date('2026-10-06T14:00:00'),
                endTime: new Date('2026-10-06T17:00:00'),
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                price: 600,
                isActive: true,
            },
        ];

        await Session.insertMany(sessions);

        console.log('✅ 2 Sessions Created');

        console.log('🎉 Database Seeded Successfully');

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seed();
