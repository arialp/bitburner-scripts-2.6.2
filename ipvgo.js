const OPPONENTS = [
  "Netburners",
  "Slum Snakes",
  "The Black Hand",
  "Tetrads",
  "Daedalus",
  "Illuminati",
];

/** @param {NS} ns */
export async function main(ns) {
  ns.go.resetBoardState(ns.go.getOpponent(), 5);
  let count = 0;

  while (true) {
    let result, x, y;
    do {
      const board = ns.go.getBoardState();

      const move = getRandomMove(board, ns.go.analysis.getValidMoves());
      [x, y] = move;
      if (x === undefined) {
        // Pass turn if no moves are found
        result = await ns.go.passTurn();
      } else {
        // Play the selected move
        result = await ns.go.makeMove(x, y);
      }

      // Log opponent's next move, once it happens
      await ns.go.opponentNextTurn();

      await ns.sleep(200);

      // Keep looping as long as the opponent is playing moves
    } while (result?.type !== "gameOver");
    count++;
    ns.print(`\n${count}\n`);
    if (count >= 5) {
      count = 0;
      // pick a new random opponent
      const opponent = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
      ns.go.resetBoardState(opponent, 5);
    } else {
      ns.go.resetBoardState(ns.go.getOpponent(), 5);
    }
  }

  // TODO: add a loop to keep playing
}

/**
 * Choose one of the empty points on the board at random to play
 */
const getRandomMove = (board, validMoves) => {
  const moveOptions = [];
  const size = board[0].length;

  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y] === true;
      // Leave some spaces to make it harder to capture our pieces.
      // We don't want to run out of empty node connections!
      const isNotReservedSpace = x % 2 === 1 || y % 2 === 1;

      if (isValidMove && isNotReservedSpace) {
        moveOptions.push([x, y]);
      }
    }
  }

  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex] ?? [];
};