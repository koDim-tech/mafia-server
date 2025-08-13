import { ROLES, ROLES_DISTRIBUTION } from '../constants.js';

export function assignRoles(players) {

  const n = players.length;
  let mafiaCount = 1;
  let doctorCount = 0;
  for (const rule of ROLES_DISTRIBUTION) {
    if (n >= rule.minPlayers) {
      mafiaCount = rule.mafia;
      doctorCount = rule.doctor;
    }
  }

  const roles = [
    ...Array(mafiaCount).fill(ROLES.MAFIA),
    ...Array(doctorCount).fill(ROLES.DOCTOR),
  ];
  while (roles.length < players.length) roles.push(ROLES.CIVILIAN);


  const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

  return players.map((player, idx) => ({
    ...player,
    role: shuffledRoles[idx],
    alive: true,
  }));
}
