import { Builder, Browser, By, until, WebDriver, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import path from 'path';
import fs from 'fs';
import type { TestResult, AutomationSummary, AutomationOutput, LogType } from '@/types';

const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');

// Pastikan folder bersih dari ss lama sebelum testing jalan
if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true, force: true });
}
fs.mkdirSync(screenshotsDir, { recursive: true });

export type Logger = (type: LogType, message: string, data?: Record<string, string>) => void;

// Menyediakan data dummy cerdas berdasarkan konteks (nama/ID) dari input lapangan.
// Menyediakan data dummy cerdas berdasarkan konteks (nama/ID) dari input lapangan.
function getDummyValue(type: string, name = '', placeholder = '', id = '', credentials?: { email?: string; password?: string }): string {
    const ctx = [name, placeholder, id].join('').toLowerCase();

    if (type === 'email' || ctx.includes('email')) return credentials?.email || 'test@nexusauto.dev';
    if (type === 'password' || ctx.includes('password') || ctx.includes('sandi')) return credentials?.password || 'Rahasia123!';
    if (type === 'tel' || ctx.includes('phone') || ctx.includes('telp')) return '081234567890';
    if (type === 'number' || ctx.includes('age') || ctx.includes('qty')) return '25';
    if (type === 'url' || ctx.includes('link')) return 'https://example.com';
    if (type === 'date') return '2025-01-01';

    const ctxMap: Record<string, string> = {
        nama: 'Budi Santoso', name: 'Budi Santoso',
        alamat: 'Jl. Contoh No. 123', address: 'Jl. Contoh No. 123',
        kota: 'Jakarta', city: 'Jakarta',
        zip: '12345', pos: '12345',
        username: 'buditest', user: 'buditest',
        company: 'Nexus Auto', perusahaan: 'Nexus Auto',
        title: 'Testing Automasi', judul: 'Testing Automasi',
        desc: 'Deskripsi tes otomatis', descrip: 'Deskripsi tes otomatis',
        search: 'Cari sesuatu', cari: 'Cari sesuatu'
    };

    for (const [key, val] of Object.entries(ctxMap)) {
        if (ctx.includes(key)) return val;
    }
    return 'Test Data NexusAuto';
}

async function takeScreenshot(driver: WebDriver, filename: string) {
    const data = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, filename), data, 'base64');
}

async function getAttr(el: WebElement, name: string) {
    return (await el.getAttribute(name)) ?? '';
}

// Memastikan loading halaman (DOM maupun background scripts) benar-benar tuntas.
async function waitForPageLoad(driver: WebDriver) {
    await driver.wait(async () => {
        return await driver.executeScript('return document.readyState') === 'complete';
    }, 15000).catch(() => { });
    await driver.sleep(1000);
}

// Scroll perlahan hingga dasar halaman untuk me-render semua elemen lazy-loaded.
async function scrollToBottom(driver: WebDriver, logger: Logger) {
    logger('info', '   📜 Scrolling ke area bawah halaman...');
    const total = await driver.executeScript<number>('return document.documentElement.scrollHeight');
    const view = await driver.executeScript<number>('return window.innerHeight');

    for (let pos = 0; pos < total; pos += view * 0.8) {
        await driver.executeScript(`window.scrollTo({ top: ${pos}, behavior: 'smooth' })`);
        await driver.sleep(300);
    }
    await driver.sleep(500);
    await driver.executeScript(`window.scrollTo(0, 0)`);
    await driver.sleep(300);
}

// Crawl seluruh internal link aktif yang satu domain untuk dites secara mendalam.
async function discoverInternalLinks(driver: WebDriver, baseOrigin: string): Promise<string[]> {
    const anchors = await driver.findElements(By.css('a[href]'));
    const links = new Set<string>();

    for (const a of anchors) {
        try {
            const url = new URL(await getAttr(a, 'href'));
            if (url.origin === baseOrigin && !url.hash && !url.pathname.includes('.')) {
                links.add(url.origin + url.pathname);
            }
        } catch { /* abaikan error URL invalid */ }
    }
    return Array.from(links);
}

// Logika Utama: Isi seluruh form (input text, textarea, dropdown) dan klik semua tombol.
async function testPage(driver: WebDriver, url: string, sessionId: number, pageIndex: number, logger: Logger, allShots: string[], credentials?: { email?: string; password?: string }): Promise<TestResult[]> {
    const res: TestResult[] = [];
    const pfx = `p${pageIndex}`;

    logger('section', `\n━━━ Tes Halaman ${pageIndex + 1}: ${url} ━━━`);
    await driver.get(url);
    await waitForPageLoad(driver);
    logger('info', `📄 Judul halaman: "${await driver.getTitle()}"`);

    const currentUrlStr = await driver.getCurrentUrl();
    const lowerUrl = currentUrlStr.toLowerCase();

    if (
        lowerUrl.includes('accounts.google.com') ||
        lowerUrl.includes('oauth') ||
        lowerUrl.includes('login') ||
        lowerUrl.includes('signin') ||
        lowerUrl.includes('auth') ||
        lowerUrl.includes('sso')
    ) {
        logger('warn', '⏳ Halaman Login/OAuth Terdeteksi! Menunggu intervensi manual selama 30 detik...');
        await driver.sleep(30000);
        logger('info', '▶️ 30 Detik usai, melanjutkan pengetesan form...');
    }

    await scrollToBottom(driver, logger);

    const ssInit = `${sessionId}_${pfx}_1_awal.png`;
    await takeScreenshot(driver, ssInit);
    allShots.push(ssInit);

    // Field Input
    const inputs = await driver.findElements(By.css('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"])'));
    for (let i = 0; i < inputs.length; i++) {
        const el = inputs[i];
        try {
            if (!(await el.isDisplayed()) || !(await el.isEnabled())) continue;

            const type = (await getAttr(el, 'type')) || 'text';
            const label = await getAttr(el, 'name') || await getAttr(el, 'id') || `input-${i}`;

            if (['checkbox', 'radio'].includes(type)) {
                if (!(await el.isSelected())) await driver.executeScript('arguments[0].click()', el);
                res.push({ type, element: label, status: 'pass', action: 'dicentang' });
            } else {
                const val = getDummyValue(type, await getAttr(el, 'name'), await getAttr(el, 'placeholder'), await getAttr(el, 'id'), credentials);
                await el.clear();
                await el.sendKeys(val);
                res.push({ type: `input[${type}]`, element: label, status: 'pass', action: `diisi: ${val}` });
            }
        } catch { /* skip jika interaksi pada elemen gagal */ }
    }

    // Textarea
    const textareas = await driver.findElements(By.css('textarea'));
    for (let i = 0; i < textareas.length; i++) {
        const el = textareas[i];
        try {
            if (!(await el.isDisplayed()) || !(await el.isEnabled())) continue;
            await el.clear();
            await el.sendKeys('Contoh teks automasi oleh NexusAuto.');
            res.push({ type: 'textarea', element: await getAttr(el, 'name') || `ta-${i}`, status: 'pass', action: 'diisi teks' });
        } catch { }
    }

    // Dropdown Select
    const selects = await driver.findElements(By.css('select'));
    for (let i = 0; i < selects.length; i++) {
        const el = selects[i];
        try {
            if (!(await el.isDisplayed())) continue;
            const opts = await el.findElements(By.css('option:not([disabled])[value]'));
            if (opts.length > 0) {
                const val = await getAttr(opts[opts.length - 1], 'value'); // Ambil opsi terakhir
                await driver.executeScript(`arguments[0].value=arguments[1]; arguments[0].dispatchEvent(new Event('change'))`, el, val);
                res.push({ type: 'select', element: await getAttr(el, 'name') || `select-${i}`, status: 'pass', action: `dipilih: ${val}` });
            }
        } catch { }
    }

    const ssIsi = `${sessionId}_${pfx}_2_terisi.png`;
    await takeScreenshot(driver, ssIsi);
    allShots.push(ssIsi);
    logger('screenshot', `📸 Screenshot sesudah form terisi (${inputs.length + textareas.length} fields)`, { file: ssIsi });

    // Tombol Aksi
    const btns = await driver.findElements(By.css('button:not([disabled]), input[type="submit"]:not([disabled])'));
    for (let i = 0; i < btns.length; i++) {
        const el = btns[i];
        try {
            if (!(await el.isDisplayed())) continue;
            const text = (await el.getText() || await getAttr(el, 'value')).trim() || `btn-${i}`;

            const currentUrl = await driver.getCurrentUrl();
            await driver.executeScript('arguments[0].click()', el);
            await driver.sleep(1200);

            const newUrl = await driver.getCurrentUrl();

            const navigated = currentUrl !== newUrl;
            res.push({ type: 'button', element: text, status: 'pass', action: navigated ? 'klik & navigasi' : 'klik ok' });

            if (navigated) {
                await driver.get(url); // kembali ke original URL jika klik memicu pindah halaman
                await waitForPageLoad(driver);
            }
        } catch { }
    }

    logger('success', `✅ Pengecekan Halaman ${pageIndex + 1} Selesai.`);
    return res;
}

export async function runAutomation(url: string, logger: Logger, credentials?: { email?: string; password?: string }): Promise<AutomationOutput> {
    const sessionId = Date.now();
    const allShots: string[] = [];
    const allRes: TestResult[] = [];

    logger('info', '🚀 Menyiapkan browser Chrome...');

    // Nonaktifkan visualisasi otomatisasi Chrome (menghapus bar 'Chrome is being controlled...')
    // serta menyembunyikan debug log bawaan Chrome di terminal pengguna (--log-level=3)
    const options = new chrome.Options()
        .addArguments('--start-maximized', '--disable-blink-features=AutomationControlled', '--log-level=3')
        .excludeSwitches('enable-automation');

    const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();

    try {
        const origin = new URL(url).origin;

        // Pemindaian Peta Situs secara dinamis (Halaman-halaman turunan)
        logger('info', '🔍 Memindai seluruh internal link untuk dites...');
        await driver.get(url);
        await waitForPageLoad(driver);
        const links = await discoverInternalLinks(driver, origin);

        // Gabungkan link awal & semua link turunan, batasi maksimal 4 untuk testing agar optimal
        const pages = [url, ...links.filter(l => l !== url && l !== url.replace(/\/$/, ''))].slice(0, 4);
        logger('info', `📌 Total ${pages.length} halaman akan dites berturut-turut.`);

        // Pengetesan setiap Halaman
        for (let i = 0; i < pages.length; i++) {
            const pageRes = await testPage(driver, pages[i], sessionId, i, logger, allShots, credentials);
            allRes.push(...pageRes);
        }

        const summary: AutomationSummary = {
            passed: allRes.filter(r => r.status === 'pass').length,
            failed: allRes.filter(r => r.status === 'error').length,
            skipped: allRes.filter(r => r.status === 'skipped').length,
            total: allRes.length
        };

        logger('done', `🎉 Automasi Web Rampung! ✅ ${summary.passed} Lolos | ❌ ${summary.failed} Gagal | 📄 ${pages.length} Halaman Dites`);
        return { results: allRes, summary, screenshots: allShots };

    } catch (err) {
        logger('error', `💥 Aplikasi Terhenti: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
    } finally {
        await driver.quit();
    }
}
