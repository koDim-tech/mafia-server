// checkWinCondition.test.js
import { jest } from '@jest/globals';
import { checkWinCondition } from './checkWinCondition.js';

describe('checkWinCondition', () => {
  let io, client, room, emitMsg;

  beforeEach(() => {
    emitMsg = [];
    io = { to: () => ({ emit: (event, data) => emitMsg.push({ event, data }) }) };
   client = {
       set: jest.fn().mockResolvedValue(),
     get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(),
    };
    room = 'testroom';
  });

  it('должен определять победу мирных', async () => {
    const roomData = {
      players: [
        { role: 'Мафия', alive: false },
        { role: 'Мирный', alive: true },
        { role: 'Мирный', alive: true }
      ],
      phase: 'night'
    };
    client.set.mockResolvedValue();
    const win = await checkWinCondition(io, client, room, roomData);
    expect(win).toBe(true);
    expect(emitMsg.find(m => m.event === 'phaseChanged').data.winner).toBe('civilians');
  });

  it('должен определять победу мафии', async () => {
    const roomData = {
      players: [
        { role: 'Мафия', alive: true },
        { role: 'Мирный', alive: true }
      ],
      phase: 'day'
    };
    client.set.mockResolvedValue();
    const win = await checkWinCondition(io, client, room, roomData);
    expect(win).toBe(true);
    expect(emitMsg.find(m => m.event === 'phaseChanged').data.winner).toBe('mafia');
  });

  it('не завершает игру, если никто не победил', async () => {
    const roomData = {
      players: [
        { role: 'Мафия', alive: true },
        { role: 'Мирный', alive: true }
      ],
      phase: 'night'
    };
    client.set.mockResolvedValue();
    const win = await checkWinCondition(io, client, room, roomData);
    expect(win).toBe(false);
  });
});
