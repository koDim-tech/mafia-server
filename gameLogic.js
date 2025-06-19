// === server/gameLogic.js ===
export function assignRoles(players) {
  const count = players.length >= 5 ? 2 : 1;
  // генерим массив индексов мафии
  const ids = players.map((_, i) => i)
    .sort(() => 0.5 - Math.random())
    .slice(0, count);
  // возвращаем роли по порядку
  return players.map((p, i) => ids.includes(i) ? 'Мафия' : 'Мирный житель');
}


