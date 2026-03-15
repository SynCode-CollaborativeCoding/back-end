import dotenv from 'dotenv';

dotenv.config();

export default {
    port: 3000,
    secretKey: process.env.SECRET_KEY || 'default_secret_key',
    roomDeleteTimeout: 1 * 60 * 1000, // 1 minute
};
