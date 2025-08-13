export const PHASES = {
  LOBBY: 'lobby',
  NIGHT_MAFIA: 'night-mafia',
  NIGHT_DOCTOR: 'night-doctor',
  DAY: 'day',
  END: 'end',
};



export const ROLES = {
  MAFIA: "mafia",
  DOCTOR: "doctor",
  CIVILIAN: "civilian",
};


export const ROLES_DISTRIBUTION = [
  { minPlayers: 4, mafia: 1, doctor: 0 },
  { minPlayers: 5, mafia: 1, doctor: 1 },
  { minPlayers: 8, mafia: 2, doctor: 1 },
  { minPlayers: 12, mafia: 3, doctor: 1 },
  // Можно добавить комиссара и т.д.
];