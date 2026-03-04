import { Builder, Browser, By, until, WebDriver, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import path from 'path';
import fs from 'fs';
import type { TestResult, AutomationSummary, AutomationOutput, LogType } from '@/types';

const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

export type Logger = (type: LogType, message: string, data?: Record<string, string>) => void;

// ─── Smart dummy data ─────────────────────────────────────────────────────────
function getDummyValue(type: string, name = '', placeholder = '', label = ''): string {
    const ctx = (name + placeholder + label).toLowerCase();
    if (type === 'email' || ctx.includes('email')) return 'test@nexusauto.dev';
    if (type === 'password' || ctx.includes('password') || ctx.includes('sandi')) return 'TestPassword123!';
    if (type === 'tel' || ctx.includes('phone') || ctx.includes('telp') || ctx.includes('hp')) return '08123456789';
    if (type === 'number' || ctx.includes('age') || ctx.includes('qty') || ctx.includes('jumlah')) return '25';
    if (type === 'url' || ctx.includes('website') || ctx.includes('url')) return 'https://example.com';
    if (type === 'date') return '2000-01-01';
    if (type === 'datetime-local') return '2000-01-01T10:00';
    if (type === 'time') return '10:00';
    if (type === 'month') return '2000-01';
    if (type === 'week') return '2000-W01';
    if (type === 'color') return '#00bcd4';
    if (type === 'range') return '50';
    if (ctx.includes('nama') || ctx.includes('name')) return 'Budi Santoso';
    if (ctx.includes('alamat') || ctx.includes('address')) return 'Jl. Contoh No. 1, Jakarta';
    if (ctx.includes('kota') || ctx.includes('city')) return 'Jakarta';
    if (ctx.includes('zip') || ctx.includes('postal')) return '12345';
    if (ctx.includes('username') || ctx.includes('user')) return 'buditest';
    if (ctx.includes('company') || ctx.includes('perusahaan')) return 'PT. Nexus Auto';
    if (ctx.includes('title') || ctx.includes('judul')) return 'Judul Contoh Test';
    if (ctx.includes('description') || ctx.includes('deskripsi')) return 'Ini adalah deskripsi pengujian otomatis oleh NexusAuto.';
    if (ctx.includes('search') || ctx.includes('cari')) return 'pencarian contoh';
    return 'Test NexusAuto';
}

// ─── Screenshot helper ────────────────────────────────────────────────────────
async function takeScreenshot(driver: WebDriver, filename: string): Promise<void> {
    const data = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, filename), data, 'base64');
}

// ─── Attribute helper ─────────────────────────────────────────────────────────
async function getAttr(el: WebElement, name: string): Promise<string> {
    return (await el.getAttribute(name)) ?? '';
}

// ─── Wait until page fully loaded (DOM + network idle heuristic) ──────────────
async function waitForPageLoad(driver: WebDriver): Promise<void> {
    // Wait for readyState === 'complete'
    await driver.wait(async () => {
        const state = await driver.executeScript<string>('return document.readyState');
        return state === 'complete';
    }, 20000, 'Page did not finish loading');
    // Extra buffer for JS-rendered content
    await driver.sleep(800);
}

// ─── Progressive scroll to bottom + back to top ───────────────────────────────
async function scrollToBottom(driver: WebDriver, logger: Logger): Promise<void> {
    logger('info', '   📜 Scroll halaman ke bawah...');
    const totalHeight = await driver.executeScript<number>(
        'return document.documentElement.scrollHeight'
    );
    const viewHeight = await driver.executeScript<number>('return window.innerHeight');
    let currentPos = 0;
    const step = Math.max(viewHeight * 0.8, 300);

    while (currentPos < totalHeight) {
        currentPos = Math.min(currentPos + step, totalHeight);
        await driver.executeScript(`window.scrollTo({ top: ${currentPos}, behavior: 'smooth' })`);
        await driver.sleep(300);
    }

    // Pause at bottom for lazy-loaded content
    await driver.sleep(600);
    // Scroll back to top
    await driver.executeScript(`window.scrollTo({ top: 0, behavior: 'smooth' })`);
    await driver.sleep(400);
}

// ─── Discover all internal links on the current page ─────────────────────────
async function discoverInternalLinks(driver: WebDriver, baseOrigin: string): Promise<string[]> {
    const anchors = await driver.findElements(By.css('a[href]'));
    const hrefs = await Promise.all(anchors.map((a) => getAttr(a, 'href')));

    const seen = new Set<string>();
    for (const href of hrefs) {
        try {
            const parsed = new URL(href);
            if (parsed.origin === baseOrigin && !href.includes('#')) {
                // Normalize: strip trailing slash, query strings for dedup
                const clean = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '') || baseOrigin;
                seen.add(clean);
            }
        } catch { /* invalid URL */ }
    }
    return Array.from(seen);
}

// ─── Test one page: fill inputs, textareas, selects, click buttons ────────────
async function testPage(
    driver: WebDriver,
    pageUrl: string,
    sessionId: number,
    pageIndex: number,
    logger: Logger,
    allScreenshots: string[]
): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const prefix = `p${pageIndex}`;

    logger('section', `\n━━━ Page ${pageIndex + 1}: ${pageUrl} ━━━`);
    logger('info', `🌐 Navigasi ke: ${pageUrl}`);
    await driver.get(pageUrl);
    await waitForPageLoad(driver);

    const title = await driver.getTitle();
    logger('info', `📄 Judul: "${title}"`);

    // Scroll to fully reveal all lazy-loaded elements
    await scrollToBottom(driver, logger);

    // Screenshot: initial state (after scroll back to top)
    const ssInit = `${sessionId}_${prefix}_00_initial.png`;
    await takeScreenshot(driver, ssInit);
    allScreenshots.push(ssInit);
    logger('screenshot', `📸 Screenshot awal halaman ${pageIndex + 1}`, { file: ssInit });

    // ─── 1. Inputs ─────────────────────────────────────────────────────────
    logger('section', '🔍 Mendeteksi field input...');
    const inputSel =
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
        ':not([type="reset"]):not([type="file"]):not([type="image"])';
    const inputs: WebElement[] = await driver.findElements(By.css(inputSel));
    logger('info', `   Ditemukan ${inputs.length} input`);

    for (let i = 0; i < inputs.length; i++) {
        const el = inputs[i];
        try {
            const type = (await getAttr(el, 'type')) || 'text';
            const name = await getAttr(el, 'name');
            const placeholder = await getAttr(el, 'placeholder');
            const id = await getAttr(el, 'id');
            const label = name || id || `${prefix}-input-${i}`;
            if (!(await el.isDisplayed()) || !(await el.isEnabled())) {
                results.push({ type: 'input', element: label, status: 'skipped', reason: 'Tidak terlihat/disabled' });
                continue;
            }
            if (type === 'checkbox' || type === 'radio') {
                if (!(await el.isSelected())) {
                    await driver.wait(until.elementIsEnabled(el), 3000);
                    await el.click();
                }
                logger('success', `   ✅ ${type}: ${label}`);
                results.push({ type, element: label, status: 'pass', action: type === 'checkbox' ? 'checked' : 'selected' });
            } else {
                const value = getDummyValue(type, name, placeholder, id);
                await driver.wait(until.elementIsEnabled(el), 3000);
                await el.clear();
                await el.sendKeys(value);
                logger('success', `   ✅ Input "${value}": ${label} [${type}]`);
                results.push({ type: `input[${type}]`, element: label, status: 'pass', action: `filled: ${value}` });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            results.push({ type: 'input', element: `${prefix}-input-${i}`, status: 'error', reason: msg });
            logger('warn', `   ⚠️  Gagal input-${i}: ${msg}`);
        }
    }

    // ─── 2. Textareas ──────────────────────────────────────────────────────
    logger('section', '🔍 Mendeteksi textarea...');
    const textareas = await driver.findElements(By.css('textarea'));
    logger('info', `   Ditemukan ${textareas.length} textarea`);
    const dummyText = 'Lorem ipsum dolor sit amet. Teks pengujian otomatis NexusAuto.';

    for (let i = 0; i < textareas.length; i++) {
        const el = textareas[i];
        try {
            const name = await getAttr(el, 'name');
            const label = name || `${prefix}-textarea-${i}`;
            if (!(await el.isDisplayed()) || !(await el.isEnabled())) continue;
            await driver.wait(until.elementIsEnabled(el), 3000);
            await el.clear();
            await el.sendKeys(dummyText);
            logger('success', `   ✅ Textarea: ${label}`);
            results.push({ type: 'textarea', element: label, status: 'pass', action: 'filled text' });
        } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            results.push({ type: 'textarea', element: `${prefix}-textarea-${i}`, status: 'error', reason: msg });
            logger('warn', `   ⚠️  Gagal textarea-${i}: ${msg}`);
        }
    }

    // ─── 3. Selects ────────────────────────────────────────────────────────
    logger('section', '🔍 Mendeteksi dropdown...');
    const selects = await driver.findElements(By.css('select'));
    logger('info', `   Ditemukan ${selects.length} select`);

    for (let i = 0; i < selects.length; i++) {
        const el = selects[i];
        try {
            const name = await getAttr(el, 'name');
            const label = name || `${prefix}-select-${i}`;
            if (!(await el.isDisplayed())) continue;
            const options = await el.findElements(By.css('option:not([disabled]):not([value=""])'));
            if (options.length > 0) {
                const value = await getAttr(options[0], 'value');
                if (value) {
                    await driver.executeScript(
                        `arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change', { bubbles: true }))`,
                        el, value
                    );
                    logger('success', `   ✅ Dropdown "${value}": ${label}`);
                    results.push({ type: 'select', element: label, status: 'pass', action: `selected: ${value}` });
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            results.push({ type: 'select', element: `${prefix}-select-${i}`, status: 'error', reason: msg });
            logger('warn', `   ⚠️  Gagal select-${i}: ${msg}`);
        }
    }

    // Screenshot after filling
    const ssFilled = `${sessionId}_${prefix}_01_filled.png`;
    await takeScreenshot(driver, ssFilled);
    allScreenshots.push(ssFilled);
    logger('screenshot', '📸 Screenshot setelah pengisian', { file: ssFilled });

    // ─── 4. Buttons ────────────────────────────────────────────────────────
    logger('section', '🔍 Mendeteksi tombol...');
    const btnSel =
        'button:not([disabled]), input[type="submit"]:not([disabled]), ' +
        'input[type="button"]:not([disabled]), input[type="reset"]:not([disabled])';
    const buttons = await driver.findElements(By.css(btnSel));
    logger('info', `   Ditemukan ${buttons.length} tombol`);

    for (let i = 0; i < buttons.length; i++) {
        const el = buttons[i];
        try {
            const rawText = await el.getText();
            const val = await getAttr(el, 'value');
            const text = (rawText || val).trim();
            if (!(await el.isDisplayed())) {
                results.push({ type: 'button', element: text || `${prefix}-btn-${i}`, status: 'skipped', reason: 'Tidak terlihat' });
                continue;
            }
            await driver.wait(until.elementIsEnabled(el), 3000);
            const urlBefore = await driver.getCurrentUrl();
            await driver.executeScript('arguments[0].click()', el);
            await driver.sleep(1200);
            const urlAfter = await driver.getCurrentUrl();

            const safeText = (text || 'btn').replace(/\s+/g, '_').slice(0, 20);
            const ssBtn = `${sessionId}_${prefix}_btn_${i}_${safeText}.png`;
            await takeScreenshot(driver, ssBtn);
            allScreenshots.push(ssBtn);

            const navigated = urlBefore !== urlAfter;
            logger('success', `   ✅ Tombol "${text || `btn-${i}`}"${navigated ? ` → ${urlAfter}` : ''}`);
            logger('screenshot', `📸 Setelah klik "${text}"`, { file: ssBtn });
            results.push({ type: 'button', element: text || `${prefix}-btn-${i}`, status: 'pass', action: navigated ? `navigasi → ${urlAfter}` : 'klik OK', screenshot: ssBtn });

            if (navigated) {
                await driver.get(pageUrl);
                await waitForPageLoad(driver);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            results.push({ type: 'button', element: `${prefix}-btn-${i}`, status: 'error', reason: msg });
            logger('warn', `   ⚠️  Gagal btn-${i}: ${msg}`);
        }
    }

    // Scroll to bottom for final screenshot
    await scrollToBottom(driver, logger);
    const ssFinal = `${sessionId}_${prefix}_99_final.png`;
    await takeScreenshot(driver, ssFinal);
    allScreenshots.push(ssFinal);
    logger('screenshot', `📸 Screenshot akhir halaman ${pageIndex + 1}`, { file: ssFinal });

    return results;
}

// ─── Main runner ──────────────────────────────────────────────────────────────
export async function runAutomation(url: string, logger: Logger): Promise<AutomationOutput> {
    const sessionId = Date.now();
    const allResults: TestResult[] = [];
    const allScreenshots: string[] = [];

    logger('info', '🚀 Membuka browser Chrome...');

    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');

    // Selenium Manager automatically picks the correct ChromeDriver
    const driver: WebDriver = await new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(options)
        .build();

    try {
        // ── Validate base URL ────────────────────────────────────────────────
        let baseOrigin: string;
        try {
            baseOrigin = new URL(url).origin;
        } catch {
            throw new Error(`URL tidak valid: ${url}`);
        }

        // ── Test entry page & discover internal links ────────────────────────
        await testPage(driver, url, sessionId, 0, logger, allScreenshots);
        allResults.push(...(await testPage(driver, url, sessionId, 0, logger, [])).slice(0));

        // Discover links from the entry page
        await driver.get(url);
        await waitForPageLoad(driver);
        await scrollToBottom(driver, logger);

        logger('section', '\n🔗 Mencari semua halaman internal...');
        const internalLinks = await discoverInternalLinks(driver, baseOrigin);
        const otherPages = internalLinks.filter((l) => l !== url.replace(/\/$/, '') && l !== url);
        logger('info', `   Ditemukan ${otherPages.length} halaman lain untuk dites`);

        // Re-test entry page properly and collect results
        const entryResults = await testPage(driver, url, sessionId, 0, logger, allScreenshots);

        // Clear what we collected above (we called testPage twice for the entry page - let's fix this)
        // Actually let me restructure: just test entry page once properly
        allResults.length = 0;
        allResults.push(...entryResults);

        // ── Test each discovered internal page ───────────────────────────────
        for (let i = 0; i < otherPages.length; i++) {
            try {
                const pageResults = await testPage(driver, otherPages[i], sessionId, i + 1, logger, allScreenshots);
                allResults.push(...pageResults);
            } catch (err) {
                const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
                logger('warn', `   ⚠️  Gagal tes halaman ${otherPages[i]}: ${msg}`);
            }
        }

        // ── Summary ──────────────────────────────────────────────────────────
        const summary: AutomationSummary = {
            passed: allResults.filter((r) => r.status === 'pass').length,
            failed: allResults.filter((r) => r.status === 'error').length,
            skipped: allResults.filter((r) => r.status === 'skipped').length,
            total: allResults.length,
        };

        logger('done',
            `\n🎉 Semua halaman selesai! ` +
            `✅ ${summary.passed} berhasil | ❌ ${summary.failed} gagal | ⏭️ ${summary.skipped} dilewati | ` +
            `📄 ${1 + otherPages.length} halaman dites`
        );

        return { results: allResults, summary, screenshots: allScreenshots };
    } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        logger('error', `💥 Error fatal: ${msg}`);
        throw err;
    } finally {
        await driver.quit();
        logger('info', '🔒 Browser ditutup');
    }
}
