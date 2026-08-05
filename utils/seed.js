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
            startDate: new Date('2026-02-21'),
            endDate: new Date('2026-02-22'),
            isActive: true,
        });

        console.log('✅ Event Created');

        // Create Sessions
        const sessions = [
            {
                event: event._id,
                day: 1,
                title: 'Opening Ceremony & Innovation Talks',
                description: 'Opening keynote followed by innovation-focused TEDx talks.',
                speakers: ['Speaker 1', 'Speaker 2'],
                startTime: new Date('2026-02-21T09:00:00'),
                endTime: new Date('2026-02-21T11:00:00'),
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
                speakers: ['Speaker 3', 'Speaker 4'],
                startTime: new Date('2026-02-21T13:00:00'),
                endTime: new Date('2026-02-21T15:00:00'),
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                price: 600,
                isActive: true,
            },
            {
                event: event._id,
                day: 2,
                title: 'Leadership & Career Talks',
                description: 'Leadership stories and career guidance sessions.',
                speakers: ['Speaker 5', 'Speaker 6'],
                startTime: new Date('2026-02-22T09:00:00'),
                endTime: new Date('2026-02-22T11:00:00'),
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                price: 500,
                isActive: true,
            },
            {
                event: event._id,
                day: 2,
                title: 'Closing Ceremony & Future Talks',
                description: 'Closing keynote and future vision TEDx talks.',
                speakers: ['Speaker 7', 'Speaker 8'],
                startTime: new Date('2026-02-22T13:00:00'),
                endTime: new Date('2026-02-22T15:00:00'),
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                price: 700,
                isActive: true,
            },
        ];

        await Session.insertMany(sessions);

        console.log('✅ 4 Sessions Created');

        console.log('🎉 Database Seeded Successfully');

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seed();
