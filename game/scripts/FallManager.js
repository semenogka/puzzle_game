globalThis.FallManager = {
    checkPlayerFall(runtime, gameOverManager, playerManager, isDead, player, fallLimit) {
        if (isDead || !player) return;

        const isCrushed = playerManager.crushed;
        const fellDown = player.y >= fallLimit + 200;
        const flewUp = player.getBoundingBox().bottom < 0;
        
        if (!isCrushed && !fellDown && !flewUp) return;

        isDead = true;
        playerManager.velocityY = 0;

        gameOverManager.show(runtime, player, isCrushed ? "Вас придавило" : "Вы сорвались");

        return true;
    }
}