import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Session from '../models/session.model.js';

const linkContainedSessions = async () => {
    await connectDB();

    const sessions = await Session.find().lean();
    const sessionsByEventAndDay = new Map();

    for (const session of sessions) {
        const key = `${session.event.toString()}:${session.day}`;
        const group = sessionsByEventAndDay.get(key) || [];
        group.push(session);
        sessionsByEventAndDay.set(key, group);
    }

    let linkedCount = 0;
    for (const group of sessionsByEventAndDay.values()) {
        const parent = group.reduce((longest, current) => {
            const currentDuration = current.endTime.getTime() - current.startTime.getTime();
            const longestDuration = longest.endTime.getTime() - longest.startTime.getTime();
            return currentDuration > longestDuration ? current : longest;
        });

        const includedSessions = group.filter(
            (candidate) =>
                candidate._id.toString() !== parent._id.toString() && candidate.startTime >= parent.startTime && candidate.endTime <= parent.endTime,
        );

        if (includedSessions.length < 2) continue;

        await Session.updateOne({ _id: parent._id }, { $set: { includedSessions: includedSessions.map((session) => session._id) } });
        linkedCount += 1;
        console.log(`Linked ${includedSessions.length} contained sessions to ${parent.title} (${parent._id}).`);
    }

    if (linkedCount === 0) {
        console.log('No full-day session containing multiple sessions was found. No records were changed.');
    }
};

linkContainedSessions()
    .catch((error) => {
        console.error('Session bundle linking failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
