import App from './app';
import Game from './game';
import SolanaController from './solana/controller';

import './lib/i18n';
import './lib/sentry';

/**
 * The entry point for the game. Create an instance of the game
 * and pass a new instance of the app onto it.
 */

window.addEventListener('load', () => {
    let app = new App(),
        solana = new SolanaController(app),
        game = new Game(app);

    solana.attachGame(game);
    app.solana = solana;
});
