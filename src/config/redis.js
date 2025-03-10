const Redis = require('redis');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Connected'));

const connectRedis = async () => {
  await redisClient.connect();
};

module.exports = { redisClient, connectRedis };