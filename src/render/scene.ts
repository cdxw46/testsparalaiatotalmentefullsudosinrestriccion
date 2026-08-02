import { Application, Container } from 'pixi.js';
import { loadTextures, type GameTextures } from './assets';
import { BoardView } from './board';
import { Overlay } from './overlay';

/** Contenedor de la parte gráfica: aplicación Pixi, tablero y rótulos. */
export class Scene {
  readonly app = new Application();
  readonly world = new Container();
  board!: BoardView;
  overlay!: Overlay;
  textures!: GameTextures;

  private onLayout: (() => void) | null = null;

  static async create(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    onProgress?: (ratio: number) => void,
  ): Promise<Scene> {
    const scene = new Scene();
    await scene.app.init({
      canvas,
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      powerPreference: 'high-performance',
    });

    scene.textures = await loadTextures(scene.app.renderer, onProgress);
    scene.board = new BoardView(scene.textures, scene.app.ticker);
    scene.overlay = new Overlay(scene.app.ticker);
    scene.world.addChild(scene.board, scene.overlay);
    scene.app.stage.addChild(scene.world);

    scene.app.renderer.on('resize', () => scene.layout());
    scene.layout();
    return scene;
  }

  onResize(handler: () => void): void {
    this.onLayout = handler;
  }

  /** Reparte el espacio: laterales para los paneles HTML y centro para el tablero. */
  layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const wide = width >= 900;
    const short = height < 520;

    const sideInset = wide ? Math.min(210, width * 0.15) : 6;
    const topInset = wide
      ? Math.max(96, height * 0.135)
      : short
        ? Math.max(52, height * 0.14)
        : Math.max(84, height * 0.12);
    const bottomInset = short ? Math.max(40, height * 0.1) : Math.max(58, height * 0.14);

    const available = {
      x: sideInset,
      y: topInset,
      width: Math.max(120, width - sideInset * 2),
      height: Math.max(120, height - topInset - bottomInset),
    };

    this.board.layout(available);
    this.overlay.layout(this.board.field, this.board.cell);
    this.onLayout?.();
  }

  setSpeed(speed: number): void {
    this.board.speed = speed;
    this.overlay.speed = speed;
  }
}
