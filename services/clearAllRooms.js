
import client from '../redisClient.js';

export async function clearAllRooms() {
  // Удаляет все ключи, начинающиеся с room: и chat:
  const roomKeys = await client.keys('room:*');
  const chatKeys = await client.keys('chat:*');
  const allKeys = [...roomKeys, ...chatKeys];
  if (allKeys.length) {
    await client.del(...allKeys);
    console.log(`[CLEANUP] Удалено ${allKeys.length} комнат и чатов из Redis`);
  }
}