import mongoose from 'mongoose';

const connectDB = async () => {
    if(!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined');
    }
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('DB Connection Error: ', error.message);
        process.exit(1);
    }
};

export default connectDB;
