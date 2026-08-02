import './style.css';
import { Synth } from './audio/synth';
import { GameController } from './game/controller';
import { GameSession } from './game/session';
import { Scene } from './render/scene';
import { Hud } from './ui/hud';
import { Modals } from './ui/modals';

const soundState = { effects: true, music: true, volume: 0.7 };

async function boot(): Promise<void> {
  const loader = document.getElementById('loader') as HTMLElement;
  const loaderBar = document.getElementById('loader-bar') as HTMLElement;
  const loaderPlay = document.getElementById('loader-play') as HTMLButtonElement;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;

  const setProgress = (ratio: number): void => {
    loaderBar.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  };

  setProgress(0.08);
  // Las fuentes deben estar listas antes de crear los textos de Pixi: si no, el
  // primer render usaría una tipografía sustituta.
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('800 40px "Baloo 2"'),
    document.fonts.load('900 20px "Nunito"'),
  ]).catch(() => undefined);
  setProgress(0.25);

  const scene = await Scene.create(canvas, stage, (ratio) => setProgress(0.25 + ratio * 0.6));
  setProgress(0.92);

  const session = new GameSession();
  const synth = new Synth();

  let hud: Hud | undefined;
  const refresh = (): void => hud?.render();

  const controller = new GameController(session, scene, synth, {
    onChange: refresh,
    onToast: (message) => hud?.toast(message),
  });

  const modals = new Modals({
    session,
    getSound: () => ({ ...soundState }),
    setSound: (state) => {
      if (state.effects !== undefined) {
        soundState.effects = state.effects;
        synth.setEnabled(state.effects);
      }
      if (state.music !== undefined) {
        soundState.music = state.music;
        synth.setMusicEnabled(state.music);
      }
      if (state.volume !== undefined) {
        soundState.volume = state.volume;
        synth.setVolume(state.volume);
      }
      hud?.setSoundState(soundState.effects);
    },
    onStartAuto: (count) => controller.startAuto(count),
    onChange: refresh,
  });

  hud = new Hud(session, controller, {
    onSpin: () => {
      void synth.unlock();
      synth.play('click');
      controller.handleSpinButton();
    },
    onBet: (direction) => {
      if (controller.busy || session.free.active) return;
      session.stepBet(direction);
      synth.play('click');
    },
    onAnte: (enabled) => {
      if (controller.busy || session.free.active) return;
      session.setAnte(enabled);
      synth.play('click');
    },
    onBuy: (kind) => {
      void synth.unlock();
      void controller.buy(kind);
    },
    onTurbo: (enabled) => {
      controller.setTurbo(enabled);
      synth.play('click');
    },
    onOpenInfo: () => {
      synth.play('click');
      modals.openInfo();
    },
    onOpenSettings: () => {
      synth.play('click');
      modals.openSettings();
    },
    onOpenAuto: () => {
      synth.play('click');
      if (controller.autoRunning) controller.stopAuto();
      else modals.openAuto();
    },
    onToggleSound: () => {
      soundState.effects = !soundState.effects;
      soundState.music = soundState.effects;
      synth.setEnabled(soundState.effects);
      synth.setMusicEnabled(soundState.music);
      hud?.setSoundState(soundState.effects);
    },
  });

  session.onChange(refresh);
  scene.onResize(refresh);
  refresh();

  setProgress(1);
  loaderPlay.hidden = false;
  loaderPlay.addEventListener('click', () => {
    void synth.unlock().then(() => {
      synth.setVolume(soundState.volume);
      synth.setEnabled(soundState.effects);
      synth.setMusicEnabled(soundState.music);
      synth.play('click');
    });
    loader.classList.add('is-done');
    window.setTimeout(() => loader.remove(), 600);
  });

  window.addEventListener('orientationchange', () => window.setTimeout(() => scene.layout(), 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) synth.stopMusic();
    else if (soundState.music) synth.startMusic();
  });
}

void boot().catch((error) => {
  console.error(error);
  const loader = document.getElementById('loader');
  if (loader) {
    loader.innerHTML = `<div class="loader__title">No se pudo iniciar el juego</div>
      <div class="loader__legal">${String(error)}</div>`;
  }
});
