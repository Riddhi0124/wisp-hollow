import { createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Game } from './game/game.js';

class WispHollowSystem extends createSystem({}) {
  private game!: Game;

  init(): void {
    const world = this.world as any;
    this.game = new Game(world.renderer, world.camera, world.scene, world.player);
    (window as any).__wisp = this.game; // handy for testing in the emulator
  }

  update(delta: number, time: number): void {
    this.game.update(delta, time);
  }
}

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(WispHollowSystem);
});
