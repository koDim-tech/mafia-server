export function getLivingPlayers(players) {
  return players.filter((p) => p.alive);
}
export function getLivingMafia(players) {
  return players.filter((p) => p.role === "Мафия" && p.alive);
}
export function getPlayer(players, playerId) {
  return players.find((p) => p.playerId === playerId);
}
