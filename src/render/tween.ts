/** Lo mínimo que necesitamos de un timeline de GSAP. */
export interface Playable {
  getChildren(): unknown[];
  kill(): unknown;
  then(onFulfilled?: (value: unknown) => unknown): Promise<unknown>;
}

/**
 * Espera a que termine una animación de GSAP.
 *
 * Un timeline vacío o con repeticiones infinitas nunca resuelve su promesa, así
 * que hay que descartar esos casos antes de esperarlo.
 */
export async function played(timeline: Playable): Promise<void> {
  if (!timeline.getChildren().length) {
    timeline.kill();
    return;
  }
  await timeline.then();
}
