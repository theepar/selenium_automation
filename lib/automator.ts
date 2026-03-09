import { Builder, Browser, By, WebDriver, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import path from 'path';
import fs from 'fs';
import type { TestResult, AutomationSummary, AutomationOutput, LogType } from '@/types';
import { ScreenRecorder } from '@/lib/recorder';

const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
const recordingsDir = path.join(process.cwd(), 'public', 'recordings');

if (fs.existsSync(screenshotsDir)) fs.rmSync(screenshotsDir, { recursive: true, force: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

if (fs.existsSync(recordingsDir)) fs.rmSync(recordingsDir, { recursive: true, force: true });
fs.mkdirSync(recordingsDir, { recursive: true });

export type Logger = (type: LogType, message: string, data?: Record<string, string>) => void;

interface FillOptions {
    type: string;
    name?: string;
    placeholder?: string;
    id?: string;
    credentials?: { email?: string; password?: string };
    contextLabel?: string;
}

function getFillValue({ type, name = '', placeholder = '', id = '', credentials, contextLabel = '' }: FillOptions): string {
    const fieldContext = [name, placeholder, id, contextLabel].join(' ').toLowerCase();

    if (type === 'email' || fieldContext.includes('email') || fieldContext.includes('surel')) return credentials?.email || 'test@nexusauto.dev';
    if (type === 'password' || fieldContext.includes('password') || fieldContext.includes('sandi') || fieldContext.includes('pass')) return credentials?.password || 'Rahasia123!';
    if (type === 'tel' || fieldContext.includes('phone') || fieldContext.includes('telp') || fieldContext.includes('hp') || fieldContext.includes('whatsapp') || fieldContext.includes('wa ')) return '081234567890';
    if (type === 'number' || fieldContext.includes('age') || fieldContext.includes('qty') || fieldContext.includes('umur') || fieldContext.includes('jumlah')) return '25';
    if (type === 'url' || fieldContext.includes('link') || fieldContext.includes('website') || fieldContext.includes('situs')) return 'https://example.com';
    if (type === 'date' || fieldContext.includes('tanggal') || fieldContext.includes('date') || fieldContext.includes('lahir')) return '2025-01-01';

    const fieldValueMap: Record<string, string> = {
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

    for (const [key, value] of Object.entries(fieldValueMap)) {
        if (fieldContext.includes(key)) return value;
    }
    return 'Test Data NexusAuto';
}

async function takeScreenshot(driver: WebDriver, filename: string) {
    const data = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, filename), data, 'base64');
}

async function getAttribute(element: WebElement, name: string) {
    return (await element.getAttribute(name)) ?? '';
}

async function waitForPageLoad(driver: WebDriver) {
    await driver.wait(async () => {
        return await driver.executeScript('return document.readyState') === 'complete';
    }, 15000).catch(() => { });
    await driver.sleep(1000);
}

async function scrollToBottom(driver: WebDriver, logger: Logger) {
    logger('info', '   📜 Scrolling to bottom of page...');
    const pageHeight = await driver.executeScript<number>('return document.documentElement.scrollHeight');
    const viewportHeight = await driver.executeScript<number>('return window.innerHeight');

    for (let position = 0; position < pageHeight; position += viewportHeight * 0.8) {
        await driver.executeScript(`window.scrollTo({ top: ${position}, behavior: 'smooth' })`);
        await driver.sleep(300);
    }
    await driver.sleep(500);
    await driver.executeScript(`window.scrollTo(0, 0)`);
    await driver.sleep(300);
}

async function getElementContext(driver: WebDriver, element: WebElement): Promise<string> {
    try {
        const id = await getAttribute(element, 'id');
        let contextText = '';

        if (id) {
            const labels = await driver.findElements(By.css(`label[for="${id}"]`));
            if (labels.length > 0) contextText = await labels[0].getText();
        }

        if (!contextText) {
            const parentText = await driver.executeScript<string>(
                `return arguments[0].parentElement ? arguments[0].parentElement.innerText : ''`, element
            );
            if (parentText && parentText.length < 150) contextText = parentText.trim();
        }

        return contextText;
    } catch {
        return '';
    }
}

async function discoverInternalLinks(driver: WebDriver, baseOrigin: string): Promise<string[]> {
    const anchors = await driver.findElements(By.css('a[href]'));
    const links = new Set<string>();
    const baseHost = new URL(baseOrigin).hostname.replace(/^www\./, '');

    for (const anchor of anchors) {
        try {
            const href = await getAttribute(anchor, 'href');
            if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

            const parsed = new URL(href);
            if (parsed.hostname.endsWith(baseHost)) {
                links.add(parsed.origin + parsed.pathname);
            }
        } catch { }
    }
    return Array.from(links);
}

async function testPage(driver: WebDriver, url: string, sessionId: number, pageIndex: number, logger: Logger, screenshots: string[], credentials?: { email?: string; password?: string }): Promise<TestResult[]> {
    const pageResults: TestResult[] = [];
    const pagePrefix = `p${pageIndex}`;

    logger('section', `\n━━━ Page ${pageIndex + 1}: ${url} ━━━`);
    await driver.get(url);
    await waitForPageLoad(driver);
    logger('info', `📄 Page title: "${await driver.getTitle()}"`);

    const currentUrl = await driver.getCurrentUrl();
    const currentUrlLower = currentUrl.toLowerCase();

    if (
        currentUrlLower.includes('accounts.google.com') ||
        currentUrlLower.includes('oauth') ||
        currentUrlLower.includes('login') ||
        currentUrlLower.includes('signin') ||
        currentUrlLower.includes('auth') ||
        currentUrlLower.includes('sso')
    ) {
        logger('warn', '⏳ Login/OAuth page detected! Waiting 30s for manual intervention...');
        await driver.sleep(30000);
        logger('info', '▶️ Resuming test after 30s wait...');
    }

    await scrollToBottom(driver, logger);

    const screenshotInitial = `${sessionId}_${pagePrefix}_1_initial.png`;
    await takeScreenshot(driver, screenshotInitial);
    screenshots.push(screenshotInitial);

    const inputs = await driver.findElements(By.css('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"])'));
    for (let i = 0; i < inputs.length; i++) {
        const element = inputs[i];
        try {
            if (!(await element.isDisplayed()) || !(await element.isEnabled())) continue;

            const type = (await getAttribute(element, 'type')) || 'text';
            const label = await getAttribute(element, 'name') || await getAttribute(element, 'id') || `input-${i}`;

            if (['checkbox', 'radio'].includes(type)) {
                if (!(await element.isSelected())) await driver.executeScript('arguments[0].click()', element);
                pageResults.push({ type, element: label, status: 'pass', action: 'checked' });
            } else {
                const elementContext = await getElementContext(driver, element);
                const value = getFillValue({
                    type,
                    name: await getAttribute(element, 'name'),
                    placeholder: await getAttribute(element, 'placeholder'),
                    id: await getAttribute(element, 'id'),
                    credentials,
                    contextLabel: elementContext,
                });
                await element.clear();
                await element.sendKeys(value);
                pageResults.push({ type: `input[${type}]`, element: label, status: 'pass', action: `filled: ${value}` });
            }
        } catch { }
    }

    const textareas = await driver.findElements(By.css('textarea'));
    for (let i = 0; i < textareas.length; i++) {
        const element = textareas[i];
        try {
            if (!(await element.isDisplayed()) || !(await element.isEnabled())) continue;
            await element.clear();
            await element.sendKeys('Sample automation text by NexusAuto.');
            pageResults.push({ type: 'textarea', element: await getAttribute(element, 'name') || `textarea-${i}`, status: 'pass', action: 'filled' });
        } catch { }
    }

    const selects = await driver.findElements(By.css('select'));
    for (let i = 0; i < selects.length; i++) {
        const element = selects[i];
        try {
            if (!(await element.isDisplayed())) continue;
            const options = await element.findElements(By.css('option:not([disabled])[value]'));
            if (options.length > 0) {
                const value = await getAttribute(options[options.length - 1], 'value');
                await driver.executeScript(`arguments[0].value=arguments[1]; arguments[0].dispatchEvent(new Event('change'))`, element, value);
                pageResults.push({ type: 'select', element: await getAttribute(element, 'name') || `select-${i}`, status: 'pass', action: `selected: ${value}` });
            }
        } catch { }
    }

    const screenshotFilled = `${sessionId}_${pagePrefix}_2_filled.png`;
    await takeScreenshot(driver, screenshotFilled);
    screenshots.push(screenshotFilled);
    logger('screenshot', `📸 Screenshot after form fill (${inputs.length + textareas.length} fields)`, { file: screenshotFilled });

    const buttons = await driver.findElements(By.css('button:not([disabled]), input[type="submit"]:not([disabled])'));
    for (let i = 0; i < buttons.length; i++) {
        const element = buttons[i];
        try {
            if (!(await element.isDisplayed())) continue;
            const buttonText = (await element.getText() || await getAttribute(element, 'value')).trim() || `button-${i}`;

            const urlBeforeClick = await driver.getCurrentUrl();
            await driver.executeScript('arguments[0].click()', element);
            await driver.sleep(1200);

            const urlAfterClick = await driver.getCurrentUrl();
            const navigated = urlBeforeClick !== urlAfterClick;
            pageResults.push({ type: 'button', element: buttonText, status: 'pass', action: navigated ? 'clicked & navigated' : 'clicked' });

            if (navigated) {
                await driver.get(url);
                await waitForPageLoad(driver);
            }
        } catch { }
    }

    logger('success', `✅ Page ${pageIndex + 1} test complete.`);
    return pageResults;
}

export async function runAutomation(url: string, logger: Logger, credentials?: { email?: string; password?: string }): Promise<AutomationOutput> {
    const sessionId = Date.now();
    const screenshots: string[] = [];
    const results: TestResult[] = [];
    const recorder = new ScreenRecorder();

    logger('info', '🚀 Launching Chrome browser...');
    logger('info', '🎥 Starting screen recording...');
    const recordingFile = recorder.start(sessionId);

    const chromeOptions = new chrome.Options()
        .addArguments('--start-maximized', '--disable-blink-features=AutomationControlled', '--log-level=3')
        .excludeSwitches('enable-automation');

    // @ts-expect-error Selenium TypeScript definitions mismatch for ChromeOptions
    const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(chromeOptions).build();

    try {
        const origin = new URL(url).origin;

        logger('info', '🔍 Starting deep crawl across all pages and subdomains...');

        const visited = new Set<string>();
        const queue = [url.replace(/\/$/, '')];
        const MAX_PAGES = 20;

        while (queue.length > 0 && visited.size < MAX_PAGES) {
            const currentUrl = queue.shift()!;
            if (visited.has(currentUrl)) continue;

            await driver.get(currentUrl);
            await waitForPageLoad(driver);

            const discovered = await discoverInternalLinks(driver, origin);
            discovered.forEach(link => {
                const normalizedLink = link.replace(/\/$/, '');
                if (!visited.has(normalizedLink) && !queue.includes(normalizedLink)) {
                    queue.push(normalizedLink);
                }
            });

            visited.add(currentUrl);
        }

        const pages = Array.from(visited);
        logger('info', `📌 Crawl complete. Found ${pages.length} pages to test.`);

        for (let i = 0; i < pages.length; i++) {
            const pageResults = await testPage(driver, pages[i], sessionId, i, logger, screenshots, credentials);
            results.push(...pageResults);
        }

        const summary: AutomationSummary = {
            passed: results.filter(r => r.status === 'pass').length,
            failed: results.filter(r => r.status === 'error').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            total: results.length,
        };

        logger('done', `🎉 Automation complete! ✅ ${summary.passed} passed | ❌ ${summary.failed} failed | 📄 ${pages.length} pages tested`);

        logger('info', '⏹️ Stopping recording & saving video...');
        await recorder.stop();
        logger('info', `🎬 Video saved: ${recordingFile}`);

        return { results, summary, screenshots, recording: recordingFile };

    } catch (err) {
        logger('error', `💥 Fatal error: ${err instanceof Error ? err.message : String(err)}`);
        await recorder.stop().catch(() => { });
        throw err;
    } finally {
        await driver.quit();
    }
}
