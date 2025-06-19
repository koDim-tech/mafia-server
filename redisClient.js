// redisClient.js
import redis from 'redis';

const client = redis.createClient({ url: 'redis://localhost:6379' });

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  await client.connect();
  console.log('Redis connected');
})();


export default client;