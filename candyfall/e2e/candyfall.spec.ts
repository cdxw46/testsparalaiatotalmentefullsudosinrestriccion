import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('.brand-name')).toHaveText('Candyfall');
  await expect(page.locator('[data-grid] .tile')).toHaveCount(49);
  await expect(page.locator('[data-action="spin"]')).toBeVisible();
}

async function waitIdle(page: Page) {
  await expect(page.locator('[data-action="spin"]')).toBeEnabled({ timeout: 45_000 });
  await expect(page.locator('[data-action="spin"]')).not.toHaveClass(/busy/);
}

function parseMoney(text: string): number {
  const cleaned = text
    .replace(/\s*\$\s*$/, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number.parseFloat(cleaned);
}

test.describe('Candyfall E2E', () => {
  test('carga UI principal y tablero 7x7', async ({ page }) => {
    await boot(page);
    await expect(page.locator('[data-credit]')).toHaveText(/1\.000,00\s*\$/);
    await expect(page.locator('[data-bet]')).toHaveText(/1,00\s*\$/);
    await expect(page.locator('[data-message]')).toBeVisible();
    await expect(page.locator('.candy-svg').first()).toBeVisible();
  });

  test('spin descuenta apuesta y vuelve a idle', async ({ page }) => {
    await boot(page);
    const creditBefore = parseMoney(await page.locator('[data-credit]').innerText());
    const bet = parseMoney(await page.locator('[data-bet]').innerText());

    await page.locator('[data-action="spin"]').click();
    await expect(page.locator('[data-action="spin"]')).toHaveClass(/busy/);
    await waitIdle(page);

    const creditAfter = parseMoney(await page.locator('[data-credit]').innerText());
    const win = parseMoney(await page.locator('[data-win]').innerText());

    // creditAfter ~= creditBefore - bet + win
    expect(creditAfter).toBeCloseTo(creditBefore - bet + win, 1);
    await expect(page.locator('[data-grid] .tile')).toHaveCount(49);
    await expect(page.locator('[data-message]')).not.toHaveText(/Girando/);
  });

  test('cambiar apuesta con + y -', async ({ page }) => {
    await boot(page);
    await page.locator('[data-action="bet-up"]').click();
    await expect(page.locator('[data-bet]')).toContainText('2,00');
    await page.locator('[data-action="bet-down"]').click();
    await expect(page.locator('[data-bet]')).toContainText('1,00');
  });

  test('modal de info abre y cierra', async ({ page }) => {
    await boot(page);
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('[data-modal]')).toBeVisible();
    await expect(page.locator('.modal-card h2')).toContainText('Cómo jugar');
    await page.locator('[data-action="close-modal"]').click();
    await expect(page.locator('[data-modal]')).toBeHidden();
  });

  test('mute toggle', async ({ page }) => {
    await boot(page);
    const mute = page.locator('[data-action="mute"]');
    await expect(mute).toHaveText('SON');
    await mute.click();
    await expect(mute).toHaveText('OFF');
    await mute.click();
    await expect(mute).toHaveText('SON');
  });

  test('auto play se activa y se puede detener', async ({ page }) => {
    await boot(page);
    await page.locator('[data-action="auto"]').click();
    await expect(page.locator('[data-action="auto"]')).toHaveClass(/active/);
    await expect(page.locator('[data-action="auto"]')).toContainText(/AUTO/);
    await page.locator('[data-action="auto"]').click();
    await expect(page.locator('[data-action="auto"]')).not.toHaveClass(/active/);
    await waitIdle(page);
  });

  test('comprar tiradas gratis descuenta crédito', async ({ page }) => {
    await boot(page);
    const creditBefore = parseMoney(await page.locator('[data-credit]').innerText());
    await page.locator('[data-action="buy-fs"]').click();
    await expect(page.locator('.stage')).toHaveClass(/in-freespins/);
    await expect(page.locator('[data-freespins]')).not.toHaveText('0');
    const creditAfter = parseMoney(await page.locator('[data-credit]').innerText());
    expect(creditAfter).toBeLessThan(creditBefore);
    await waitIdle(page);
  });

  test('layout móvil: controles y tablero visibles sin overflow horizontal', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'solo móvil');
    await boot(page);

    const metrics = await page.evaluate(() => {
      const stage = document.querySelector('.stage') as HTMLElement;
      const machine = document.querySelector('.machine') as HTMLElement;
      const spin = document.querySelector('[data-action="spin"]') as HTMLElement;
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        machineVisible: machine.getBoundingClientRect().width > 0,
        spinVisible: spin.getBoundingClientRect().height >= 40,
        stageOverflowX: stage.scrollWidth <= stage.clientWidth + 2,
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
    expect(metrics.machineVisible).toBeTruthy();
    expect(metrics.spinVisible).toBeTruthy();
    expect(metrics.stageOverflowX).toBeTruthy();

    // Spin usable on phone
    await page.locator('[data-action="spin"]').click();
    await waitIdle(page);
    await expect(page.locator('[data-grid] .tile')).toHaveCount(49);
  });
});
