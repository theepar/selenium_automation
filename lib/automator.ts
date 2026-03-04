import { Builder, Browser, By, WebDriver, WebElement } from 'selenium-webdriver';
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

interface DummyOptions {
    type: string;
    name?: string;
    placeholder?: string;
    id?: string;
    credentials?: { email?: string; password?: string };
    contextLabel?: string;
}

function getDummyValue({ type, name = '', placeholder = '', id = '', credentials, contextLabel = '' }: DummyOptions): string {
    const ctx = [name, placeholder, id, contextLabel].join(' ').toLowerCase();

    if (type === 'email' || ctx.includes('email') || ctx.includes('surel')) return credentials?.email || 'test@nexusauto.dev';
    if (type === 'password' || ctx.includes('password') || ctx.includes('sandi') || ctx.includes('pass')) return credentials?.password || 'Rahasia123!';
    if (type === 'tel' || ctx.includes('phone') || ctx.includes('telp') || ctx.includes('hp') || ctx.includes('whatsapp') || ctx.includes('wa ')) return '081234567890';
    if (type === 'number' || ctx.includes('age') || ctx.includes('qty') || ctx.includes('umur') || ctx.includes('jumlah')) return '25';
    if (type === 'url' || ctx.includes('link') || ctx.includes('website') || ctx.includes('situs')) return 'https://example.com';
    if (type === 'date' || ctx.includes('tanggal') || ctx.includes('date') || ctx.includes('lahir')) return '2025-01-01';

    const ctxMap: Record<string, string> = {
        nik: '3171234567890123', 'induk kependudukan': '3171234567890123',
        ktp: '3171234567890123',
        npwp: '12.345.678.9-012.000',
        nama: 'Budi Santoso', name: 'Budi Santoso',
        alamat: 'Gedung Kesenian Jakarta, Jl. Gedung Kesenian No.1', address: 'Gedung Kesenian Jakarta, Jl. Gedung Kesenian No.1',
        kota: 'Jakarta', city: 'Jakarta',
        provinsi: 'DKI Jakarta', state: 'DKI Jakarta',
        zip: '10710', pos: '10710',
        username: 'buditest', user: 'buditest',
        company: 'Nexus Auto', perusahaan: 'Nexus Auto',
        title: 'Testing Automasi Sistem', judul: 'Testing Automasi Sistem',
        desc: 'Testing input deskripsi secara otomatis menggunakan robot QA.', descrip: 'Testing input deskripsi secara otomatis menggunakan robot QA.',
        pesan: 'Halo, saya coba menghubungi via form QA NexusAuto.', message: 'Halo, saya coba menghubungi via form QA NexusAuto.',
        search: 'Cari modul testing', cari: 'Cari modul testing',
        captcha: 'AbCdEf',
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

// Crawl Context Aware: Membaca teks pada elemen parent atau label terdekat.
async function scrapeElementContext(driver: WebDriver, el: WebElement): Promise<string> {
    try {
        const id = await getAttr(el, 'id');
        let contextText = '';

        // Coba cari label berdasarkan For ID
        if (id) {
            const labels = await driver.findElements(By.css(`label[for="${id}"]`));
            if (labels.length > 0) contextText = await labels[0].getText();
        }

        // Jika masih kosong, coba ekstrak teks murni di parent wrapper terdekatnya 
        // yang sering menampung label implisit. 
        // Menggunakan xpath ancestor yang memiliki teks pendek
        if (!contextText) {
            const parentText = await driver.executeScript<string>(
                `return arguments[0].parentElement ? arguments[0].parentElement.innerText : ''`, el
            );
            // Ambil maksimal 50 karakter agar context tidak tercemar teks sampah panjang
            if (parentText && parentText.length < 150) {
                contextText = parentText.trim();
            }
        }

        return contextText;
    } catch {
        return '';
    }
}

// Deep Crawl (Menelusuri href sub-domain juga)
async function discoverInternalLinks(driver: WebDriver, baseOrigin: string): Promise<string[]> {
    const anchors = await driver.findElements(By.css('a[href]'));
    const links = new Set<string>();

    // Bersihkan host target (contoh.com) untuk pencocokan toleran sub-domain (seperti app.contoh.com)
    const baseHost = new URL(baseOrigin).hostname.replace(/^www\./, '');

    for (const a of anchors) {
        try {
            const href = await getAttr(a, 'href');
            if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

            const url = new URL(href);
            // Toleransi Sub-domain: izinkan selama host aslinya berakhiran baseHost
            if (url.hostname.endsWith(baseHost) && !url.hash && !url.pathname.includes('.')) {
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
                const ctxLabel = await scrapeElementContext(driver, el);
                const val = getDummyValue({
                    type,
                    name: await getAttr(el, 'name'),
                    placeholder: await getAttr(el, 'placeholder'),
                    id: await getAttr(el, 'id'),
                    credentials,
                    contextLabel: ctxLabel
                });
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

    // @ts-expect-error Selenium TypeScript definitions mismatch for ChromeOptions
    const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();

    try {
        const origin = new URL(url).origin;

        logger('info', '🔍 Memulai Deep Crawling link di seluruh halaman dan sub-domain...');

        // Deep Crawl Logic - Sistem Queue BFS sederhana hingga batas Max_Pages (4)
        const visitedPages = new Set<string>();
        const queueToVisit = [url.replace(/\/$/, '')]; // Normalisasi tanpa trailing slash

        while (queueToVisit.length > 0 && visitedPages.size < 4) {
            const currentCrawl = queueToVisit.shift()!;
            if (visitedPages.has(currentCrawl)) continue;

            await driver.get(currentCrawl);
            await waitForPageLoad(driver);

            const discovered = await discoverInternalLinks(driver, origin);
            discovered.forEach(link => {
                const normLink = link.replace(/\/$/, '');
                if (!visitedPages.has(normLink) && !queueToVisit.includes(normLink)) {
                    queueToVisit.push(normLink);
                }
            });

            visitedPages.add(currentCrawl);
        }

        const pages = Array.from(visitedPages);
        logger('info', `📌 Crawling usai. Ditemukan ${pages.length} target halaman (Maksimal 4 agar optimal).`);

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
