import 'dotenv/config';

import connectDB from '../config/db.js';
import Event from '../models/event.model.js';
import Session from '../models/session.model.js';

const seed = async () => {
    try {
        await connectDB();

        console.log('🌱 Seeding database...');

        await Session.deleteMany({});
        await Event.deleteMany({});

        const event = await Event.create({
            title: 'TEDx DY Patil 2026',
            startDate: new Date('2026-10-06T10:00:00.000Z'),
            endDate: new Date('2026-10-06T18:00:00.000Z'),
            isActive: true,
        });

        const sessions = [
            {
                event: event._id,
                title: 'Morning Session',
                speakers: ['Speaker 1', 'Speaker 2', 'Speaker 3'],
                day: 1,
                startTime: new Date('2026-10-06T10:00:00.000Z'),
                endTime: new Date('2026-10-06T13:00:00.000Z'),
                price: 499,
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                isActive: true,
            },
            {
                event: event._id,
                title: 'Evening Session',
                speakers: ['Speaker 4', 'Speaker 5', 'Speaker 6'],
                day: 1,
                startTime: new Date('2026-10-06T14:00:00.000Z'),
                endTime: new Date('2026-10-06T17:00:00.000Z'),
                price: 599,
                totalSeats: 350,
                reservedSeats: 0,
                soldSeats: 0,
                isActive: true,
            },
        ];

        const createdSessions = await Session.insertMany(sessions);

        console.log('✅ Event created:', event._id.toString());
        console.log('✅ Sessions created:');
        createdSessions.forEach((session) => {
            console.log(`   - ${session.title}: ${session._id.toString()}`);
        });

        console.log('\n🎉 Database seeded successfully.');
        console.log('Use these values in the booking request:');
        console.log(`selectedSessions: ["${createdSessions[0]._id.toString()}", "${createdSessions[1]._id.toString()}"]`);

        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
};

seed();
