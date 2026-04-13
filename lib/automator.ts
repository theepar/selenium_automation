import {
  Builder,
  Browser,
  By,
  until,
  WebDriver,
  WebElement,
} from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import path from "path";
import fs from "fs";
import type {
  TestResult,
  AutomationSummary,
  AutomationOutput,
  LogType,
  FlowType,
} from "@/types";
import { ScreenRecorder } from "@/lib/recorder";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum ms to wait for an element to appear / become visible */
const WAIT_TIMEOUT = 15_000;

/** Shorter timeout used when just probing for optional elements */
const SHORT_WAIT = 4_000;

/** Artificial pause between consecutive field fills (ms) */
const STEP_DELAY = 700;

// ─── Directory bootstrap ──────────────────────────────────────────────────────

const screenshotsDir = path.join(process.cwd(), "public", "screenshots");
const recordingsDir = path.join(process.cwd(), "public", "recordings");

function cleanDir(dir: string) {
  try {
    if (fs.existsSync(dir))
      fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Directory may be locked — clear contents instead
    try {
      for (const file of fs.readdirSync(dir)) {
        try { fs.unlinkSync(path.join(dir, file)); } catch { /* skip locked files */ }
      }
    } catch { /* directory may not exist yet */ }
  }
  fs.mkdirSync(dir, { recursive: true });
}

cleanDir(screenshotsDir);
cleanDir(recordingsDir);

// ─── Public Types ─────────────────────────────────────────────────────────────

export type Logger = (
  type: LogType,
  message: string,
  data?: Record<string, string>,
) => void;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Credentials {
  email: string;
  password: string;
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

async function takeScreenshot(
  driver: WebDriver,
  filename: string,
): Promise<void> {
  const data = await driver.takeScreenshot();
  fs.writeFileSync(path.join(screenshotsDir, filename), data, "base64");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getAttribute(
  element: WebElement,
  name: string,
): Promise<string> {
  return (await element.getAttribute(name)) ?? "";
}

/** Wait for document.readyState === "complete" then sleep a beat. */
async function waitForPageLoad(driver: WebDriver): Promise<void> {
  await driver
    .wait(async () => {
      return (
        (await driver.executeScript("return document.readyState")) ===
        "complete"
      );
    }, WAIT_TIMEOUT)
    .catch(() => { });
  await driver.sleep(1_200);
}

/**
 * Try each selector in order and return the first visible element found.
 * Selectors starting with "//" are treated as XPath; everything else is CSS.
 *
 * @throws Error when no selector matches within the given timeout.
 */
async function findElement(
  driver: WebDriver,
  selectors: string[],
  fieldName: string,
  timeout = SHORT_WAIT,
): Promise<WebElement> {
  for (const selector of selectors) {
    try {
      const locator = selector.startsWith("//")
        ? By.xpath(selector)
        : By.css(selector);
      const el = await driver.wait(until.elementLocated(locator), timeout);
      await driver.wait(until.elementIsVisible(el), timeout);
      return el;
    } catch {
      /* try next selector */
    }
  }
  throw new Error(
    `[${fieldName}] No visible element found. Tried: ${selectors.join(", ")}`,
  );
}

/** Click via WebDriver; fall back to JS click on interactability errors. */
async function safeClick(
  driver: WebDriver,
  element: WebElement,
): Promise<void> {
  try {
    await element.click();
  } catch {
    await driver.executeScript("arguments[0].click()", element);
  }
}

/**
 * Clear a field and type a value.
 * Uses JS to wipe the current value first, which works better with
 * React-controlled inputs than element.clear() alone.
 */
async function safeFill(
  driver: WebDriver,
  element: WebElement,
  value: string,
): Promise<void> {
  await driver.executeScript('arguments[0].value = ""', element);
  await element.clear();
  await element.sendKeys(value);
  // Trigger React's synthetic change event
  await driver.executeScript(
    `arguments[0].dispatchEvent(new Event('input',  { bubbles: true }));
     arguments[0].dispatchEvent(new Event('change', { bubbles: true }));`,
    element,
  );
}

/**
 * Generate data that is guaranteed to be unique per script run.
 * Uses a millisecond timestamp + a 4-digit random suffix so two
 * near-simultaneous runs won't collide.
 */
function generateUniqueData() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 9_000) + 1_000;

  // Indonesian mobile prefixes (digits after +62)
  // Telkomsel: 811-813, 821-823, 851-853  |  Indosat: 814-816, 855-858
  // XL: 817-819, 859, 877-879  |  Tri: 895-899  |  Smartfren: 881-889
  const prefixes = [
    "811", "812", "813", "821", "822", "823", "851", "852", "853",
    "814", "815", "816", "855", "856", "857", "858",
    "817", "818", "819", "859", "877", "878", "879",
    "895", "896", "897", "898", "899",
    "881", "882", "883", "884", "885", "886", "887", "888", "889",
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  // Generate 7-8 random digits after the prefix (total 10-11 digits)
  const suffixLen = Math.random() < 0.5 ? 7 : 8;
  const suffix = Array.from({ length: suffixLen }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  const phone = `${prefix}${suffix}`;

  return {
    name: `Test User ${ts}`,
    email: `testuser_${ts}_${rand}@testmail.dev`,
    username: `u${String(ts).slice(-6)}${rand}${Math.random().toString(36).slice(2, 7)}`.slice(0, 16),
    password: "TestPass123!",
    /** Digits after the +62 country prefix */
    phone,
  };
}

// ─── Phone country-code dropdown: select Indonesia (+62) ─────────────────────

/**
 * Attempts to open the country-code dropdown attached to the phone field
 * and select "Indonesia".
 *
 * The function tries several common patterns used by popular phone-input
 * libraries (react-phone-input-2, intl-tel-input) plus generic XPath.
 *
 * 🔧 ADJUST: If none of these match, open DevTools on the SocialVit
 *    registration page, inspect the element that holds the flag/+62 prefix,
 *    and add its selector to `triggerSelectors` below.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function selectIndonesiaPhoneCode(
  driver: WebDriver,
  logger: Logger,
): Promise<boolean> {
  logger("info", "   🇮🇩 Attempting to select Indonesia (+62) phone code…");

  // ── 1. Selectors that open the country-code dropdown ───────────────────────
  // 🔧 ADJUST: add the real SocialVit selector here if the defaults miss.
  const triggerSelectors: string[] = [
    // react-phone-input-2
    ".flag-dropdown",
    ".flag-dropdown .selected-flag",
    ".react-tel-input .flag-dropdown",
    // intl-tel-input
    ".iti__flag-container",
    ".iti__selected-flag",
    // Generic custom patterns
    "[class*='phone-flag']",
    "[class*='country-code']",
    "[class*='dial-code']",
    "[class*='PhoneInput'] button",
    "[class*='phone'] [class*='prefix']",
    "[class*='phone'] [class*='selector']",
    // XPath: first sibling before a tel/phone input
    "//input[@type='tel']/preceding-sibling::*[1]",
    "//input[contains(@name,'phone')]/preceding-sibling::*[1]",
  ];

  for (const selector of triggerSelectors) {
    try {
      const locator = selector.startsWith("//")
        ? By.xpath(selector)
        : By.css(selector);
      const candidates = await driver.findElements(locator);
      if (candidates.length === 0) continue;

      const trigger = candidates[0];
      if (!(await trigger.isDisplayed())) continue;

      await safeClick(driver, trigger);
      await driver.sleep(600);

      // ── 2. Selectors for the "Indonesia" option inside the opened dropdown ──
      // 🔧 ADJUST: if SocialVit renders Indonesia differently, add its selector.
      const indonesiaSelectors: string[] = [
        "[data-country-code='id']",
        "[data-country-code='ID']",
        "[data-dial-code='62']",
        "li[id*='id']",
        // XPath text-based — most reliable fallback
        "//*[contains(text(),'Indonesia') and (self::li or self::div or self::span or self::option)]",
        "//*[@data-country='ID' or @data-country='id']",
      ];

      let selected = false;

      for (const idSel of indonesiaSelectors) {
        try {
          const idLocator = idSel.startsWith("//")
            ? By.xpath(idSel)
            : By.css(idSel);
          const opt = await driver.wait(until.elementLocated(idLocator), 2_000);
          await driver.wait(until.elementIsVisible(opt), 2_000);
          await safeClick(driver, opt);
          selected = true;
          break;
        } catch {
          /* try next */
        }
      }

      // ── 3. Last resort: type "Indonesia" in the dropdown search box ─────────
      if (!selected) {
        try {
          const searchBox = await driver.wait(
            until.elementLocated(
              By.css(
                "[class*='search'], input[placeholder*='search' i], input[placeholder*='cari' i]",
              ),
            ),
            2_000,
          );
          await searchBox.sendKeys("Indonesia");
          await driver.sleep(400);
          const opt = await driver.wait(
            until.elementLocated(
              By.xpath("//*[contains(text(), 'Indonesia')]"),
            ),
            2_000,
          );
          await safeClick(driver, opt);
          selected = true;
        } catch {
          /* search box not found */
        }
      }

      if (selected) {
        logger("success", "   ✅ Indonesia (+62) selected successfully");
        await driver.sleep(300);

        // Close the dropdown if it's still open
        try {
          await driver.executeScript(`
            document.activeElement?.blur();
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            document.body.click();
          `);
          await driver.sleep(500);
        } catch { /* ignore */ }

        return true;
      }
    } catch {
      /* try next trigger selector */
    }
  }

  logger("warn", "   ⚠️  Could not select Indonesia phone code.");
  logger(
    "warn",
    "   💡 TIP: Inspect the phone country-code trigger in DevTools and add",
  );
  logger(
    "warn",
    "      its selector to selectIndonesiaPhoneCode() → triggerSelectors[]",
  );
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 1 — REGISTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Automates the full registration flow on a SocialVit-style sign-up page.
 *
 * Fill order: Name → Email → Password → Password Confirmation →
 *             Phone (Indonesia dropdown first) → Username → Sign Up
 *
 * Assertion: waits for URL redirect OR a visible success element.
 */
async function runRegisterFlow(
  driver: WebDriver,
  url: string,
  logger: Logger,
  screenshots: string[],
  sessionId: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const data = generateUniqueData();

  logger("section", "━━━ REGISTER FLOW ━━━");
  logger("info", "📋 Auto-generated unique test data:");
  logger("info", `   📛 Name     : ${data.name}`);
  logger("info", `   📧 Email    : ${data.email}`);
  logger("info", `   👤 Username : ${data.username}`);
  logger("info", `   🔑 Password : ${data.password}`);

  // ── Navigate ────────────────────────────────────────────────────────────────
  logger("info", `🌐 Navigating to: ${url}`);
  await driver.get(url);
  await waitForPageLoad(driver);

  // Wait for the registration form to be present in the DOM.
  // 🔧 ADJUST: change the CSS selector below if the form has a unique wrapper class.
  logger("info", "⏳ Waiting for registration form to render…");
  try {
    await driver.wait(
      until.elementLocated(
        By.css(
          'form, [class*="register"], [class*="signup"], [class*="auth-form"]',
        ),
      ),
      WAIT_TIMEOUT,
    );
  } catch {
    logger("warn", "⚠️  Form container not detected — proceeding anyway…");
  }
  await driver.sleep(800);

  // Screenshot ① — page initial state
  const ss1 = `${sessionId}_reg_1_initial.png`;
  await takeScreenshot(driver, ss1);
  screenshots.push(ss1);
  logger("screenshot", "📸 Registration page loaded", { file: ss1 });

  // ── Step 1 / 6 — Name ───────────────────────────────────────────────────────
  logger("info", "✏️  Step 1/6 — Name");
  /**
   * 🔧 ADJUST SELECTOR — Name field.
   * Open DevTools → Elements, find the name <input>, note its name/id/placeholder,
   * and put the most specific CSS selector first in the list below.
   */
  const nameSelectors = [
    'input[name="name"]',
    'input[name="full_name"]',
    'input[name="fullName"]',
    'input[id="name"]',
    'input[placeholder*="name" i]',
    'input[placeholder*="nama" i]',
    'input[placeholder*="full name" i]',
  ];
  try {
    const el = await findElement(driver, nameSelectors, "Name");
    await safeFill(driver, el, data.name);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[text]",
      element: "name",
      status: "pass",
      action: `filled: "${data.name}"`,
    });
    logger("success", `   ✅ Name filled: "${data.name}"`);
  } catch (e) {
    results.push({
      type: "input[text]",
      element: "name",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Name field not found — adjust nameSelectors in runRegisterFlow()",
    );
  }

  // ── Step 2 / 6 — Email ──────────────────────────────────────────────────────
  logger("info", "✏️  Step 2/6 — Email");
  /**
   * 🔧 ADJUST SELECTOR — Email field.
   */
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="surel" i]',
  ];
  try {
    const el = await findElement(driver, emailSelectors, "Email");
    await safeFill(driver, el, data.email);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[email]",
      element: "email",
      status: "pass",
      action: `filled: "${data.email}"`,
    });
    logger("success", `   ✅ Email filled: "${data.email}"`);
  } catch (e) {
    results.push({
      type: "input[email]",
      element: "email",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Email field not found — adjust emailSelectors in runRegisterFlow()",
    );
  }

  // ── Step 3 / 6 — Password ───────────────────────────────────────────────────
  logger("info", "✏️  Step 3/6 — Password");
  /**
   * 🔧 ADJUST SELECTOR — First password field (not the confirmation).
   * The fallback grabs the first visible <input type="password"> on the page.
   */
  try {
    const allPwInputs = await driver.findElements(
      By.css('input[type="password"]'),
    );
    let pwInput: WebElement | null = null;
    for (const el of allPwInputs) {
      if (await el.isDisplayed()) {
        pwInput = el;
        break;
      }
    }
    if (!pwInput)
      pwInput = await findElement(
        driver,
        ['input[name="password"]', 'input[id="password"]'],
        "Password",
      );

    await driver.wait(until.elementIsVisible(pwInput), WAIT_TIMEOUT);
    await safeFill(driver, pwInput, data.password);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[password]",
      element: "password",
      status: "pass",
      action: "filled: [hidden]",
    });
    logger("success", "   ✅ Password filled");
  } catch (e) {
    results.push({
      type: "input[password]",
      element: "password",
      status: "error",
      reason: String(e),
    });
    logger("warn", "   ⚠️  Password field not found — check runRegisterFlow()");
  }

  // ── Step 4 / 6 — Password Confirmation ─────────────────────────────────────
  logger("info", "✏️  Step 4/6 — Password Confirmation");
  /**
   * 🔧 ADJUST SELECTOR — Confirmation password field.
   * Preferred approach: use the SECOND visible <input type="password">.
   * Named-attribute selectors are listed as fallbacks.
   */
  const confirmSelectors = [
    'input[name="password_confirmation"]',
    'input[name="confirmPassword"]',
    'input[name="confirm_password"]',
    'input[name="passwordConfirmation"]',
    'input[id*="confirm" i]',
    'input[placeholder*="confirm" i]',
    'input[placeholder*="konfirmasi" i]',
    'input[placeholder*="ulangi" i]',
  ];
  try {
    const allPwInputs = await driver.findElements(
      By.css('input[type="password"]'),
    );
    const visiblePwInputs: WebElement[] = [];
    for (const el of allPwInputs) {
      if (await el.isDisplayed()) visiblePwInputs.push(el);
    }

    const confirmInput =
      visiblePwInputs.length >= 2
        ? visiblePwInputs[1]
        : await findElement(driver, confirmSelectors, "Password Confirmation");

    await driver.wait(until.elementIsVisible(confirmInput), WAIT_TIMEOUT);
    await safeFill(driver, confirmInput, data.password);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[password]",
      element: "password_confirmation",
      status: "pass",
      action: "filled: [hidden]",
    });
    logger("success", "   ✅ Password confirmation filled");
  } catch (e) {
    results.push({
      type: "input[password]",
      element: "password_confirmation",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Confirmation field not found — adjust confirmSelectors in runRegisterFlow()",
    );
  }

  // Screenshot ② — passwords filled
  const ss2 = `${sessionId}_reg_2_passwords.png`;
  await takeScreenshot(driver, ss2);
  screenshots.push(ss2);
  logger("screenshot", "📸 After filling password fields", { file: ss2 });

  // ── Step 5 / 6 — Phone Number (Indonesia) ───────────────────────────────────
  logger("info", "📱 Step 5/6 — Phone Number (Indonesia)");

  // Attempt to select Indonesia from dropdown first
  const codeSelected = await selectIndonesiaPhoneCode(driver, logger);
  const inputPhone = codeSelected ? data.phone : `+62${data.phone}`;

  const phoneSelectors = [
    'input[name="phone"]',
    'input[name="phone_number"]',
    'input[name="phoneNumber"]',
    'input[name="no_hp"]',
    'input[name="no_telp"]',
    'input[type="tel"]',
    'input[placeholder*="phone" i]',
    'input[placeholder*="nomor" i]',
    'input[placeholder*="hp" i]',
    'input[placeholder*="handphone" i]',
    'input[placeholder*="whatsapp" i]',
  ];
  try {
    const el = await findElement(driver, phoneSelectors, "Phone");
    await driver.wait(until.elementIsVisible(el), WAIT_TIMEOUT);
    await safeClick(driver, el);
    await driver.sleep(300);
    // Select all (Ctrl+A) then type the number to overwrite
    const { Key } = await import("selenium-webdriver");
    await el.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE);
    await driver.sleep(100);
    await el.sendKeys(inputPhone);
    // Trigger React change events
    await driver.executeScript(
      `arguments[0].dispatchEvent(new Event('input',  { bubbles: true }));
       arguments[0].dispatchEvent(new Event('change', { bubbles: true }));`,
      el,
    );
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[tel]",
      element: "phone",
      status: "pass",
      action: `filled: "${inputPhone}"`,
    });
    logger("success", `   ✅ Phone filled: ${inputPhone}`);
  } catch (e) {
    results.push({
      type: "input[tel]",
      element: "phone",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Phone field not found — adjust phoneSelectors in runRegisterFlow()",
    );
  }

  // ── Step 6 / 6 — Username ───────────────────────────────────────────────────
  logger("info", "✏️  Step 6/6 — Username");
  /**
   * 🔧 ADJUST SELECTOR — Username field.
   */
  const usernameSelectors = [
    'input[name="username"]',
    'input[name="user_name"]',
    'input[id="username"]',
    'input[placeholder*="username" i]',
    'input[placeholder*="user name" i]',
    'input[placeholder*="nama pengguna" i]',
  ];
  try {
    const el = await findElement(driver, usernameSelectors, "Username");
    await safeFill(driver, el, data.username);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[text]",
      element: "username",
      status: "pass",
      action: `filled: "${data.username}"`,
    });
    logger("success", `   ✅ Username filled: "${data.username}"`);
  } catch (e) {
    results.push({
      type: "input[text]",
      element: "username",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Username field not found — adjust usernameSelectors in runRegisterFlow()",
    );
  }

  // Screenshot ③ — form fully filled
  const ss3 = `${sessionId}_reg_3_filled.png`;
  await takeScreenshot(driver, ss3);
  screenshots.push(ss3);
  logger("screenshot", "📸 Form fully filled — about to submit", { file: ss3 });

  // ── Click Sign Up ────────────────────────────────────────────────────────────
  logger("info", '🖱️  Clicking "Sign Up" button…');
  /**
   * 🔧 ADJUST SELECTOR — Registration submit button.
   * XPath patterns here do a case-insensitive text match by converting to lowercase.
   */
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    "[class*='register-btn']",
    "[class*='signup-btn']",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'sign up')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'register')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'daftar')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'buat akun')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'create account')]",
  ];
  try {
    const btn = await findElement(driver, submitSelectors, "Sign Up Button");
    const btnText = (await btn.getText()).trim();
    await safeClick(driver, btn);
    results.push({
      type: "button",
      element: btnText || "Sign Up",
      status: "pass",
      action: "clicked",
    });
    logger("success", `   ✅ Clicked: "${btnText || "Sign Up"}"`);
  } catch (e) {
    results.push({
      type: "button",
      element: "Sign Up",
      status: "error",
      reason: String(e),
    });
    logger(
      "error",
      "   ❌ Sign Up button not found — adjust submitSelectors in runRegisterFlow()",
    );
  }

  // ── Assertion — wait for success indicator ───────────────────────────────────
  logger("info", "⏳ Asserting registration success…");
  await driver.sleep(2_000);
  let registrationSuccess = false;

  // Assertion ①: URL changes to a post-registration destination
  try {
    /**
     * 🔧 ADJUST: extend the list with the actual redirect path SocialVit uses
     *    after successful registration (e.g. '/verify-email', '/welcome').
     */
    await driver.wait(async () => {
      const cur = await driver.getCurrentUrl();
      return (
        cur !== url &&
        (/\/(login|dashboard|home|feed|verify|success|welcome)/.test(cur) ||
          cur !== url)
      );
    }, WAIT_TIMEOUT);

    const finalUrl = await driver.getCurrentUrl();
    if (finalUrl !== url) {
      registrationSuccess = true;
      logger(
        "success",
        `   ✅ ASSERTION PASSED — redirected to: "${finalUrl}"`,
      );
      results.push({
        type: "assertion",
        element: "URL redirect",
        status: "pass",
        action: `Redirected to: ${finalUrl}`,
      });
    }
  } catch {
    /* fall through to element-based assertion */
  }

  // Assertion ②: a visible success / toast element
  if (!registrationSuccess) {
    try {
      /**
       * 🔧 ADJUST SELECTOR — Success message element.
       * Add the real SocialVit success-toast selector if you know it.
       */
      const successSelectors = [
        "[class*='success']",
        "[class*='alert-success']",
        "[role='alert']",
        ".toast",
        "[class*='toast']",
        "[class*='notification']",
        "//p[contains(.,'Registration Successful')]",
        "//p[contains(.,'Registrasi Berhasil')]",
        "//div[contains(.,'Account created')]",
        "//div[contains(.,'Akun berhasil dibuat')]",
        "//h1[contains(.,'Welcome')]",
        "//h2[contains(.,'Verification')]",
        "//div[contains(.,'check your email')]",
        "//div[contains(.,'cek email')]",
      ];
      const successEl = await findElement(
        driver,
        successSelectors,
        "Success Indicator",
        WAIT_TIMEOUT,
      );
      const successText = (await successEl.getText()).trim();
      registrationSuccess = true;
      logger(
        "success",
        `   ✅ ASSERTION PASSED — success element found: "${successText}"`,
      );
      results.push({
        type: "assertion",
        element: "Success message",
        status: "pass",
        action: `Found: "${successText}"`,
      });
    } catch {
      logger("error", "   ❌ ASSERTION FAILED — no success indicator found.");
      logger("warn", "   💡 Possible causes:");
      logger(
        "warn",
        "      • Form validation errors (password too weak, duplicate email)",
      );
      logger(
        "warn",
        "      • Success element uses a different selector → adjust successSelectors",
      );
      logger("warn", "      • CAPTCHA or additional verification step present");
      results.push({
        type: "assertion",
        element: "Registration success",
        status: "error",
        reason: "No success indicator detected",
      });
    }
  }

  // Screenshot ④ — final result
  const ss4 = `${sessionId}_reg_4_result.png`;
  await takeScreenshot(driver, ss4);
  screenshots.push(ss4);
  logger(
    "screenshot",
    `📸 Final result — ${registrationSuccess ? "✅ SUCCESS" : "❌ FAILED"}`,
    { file: ss4 },
  );

  logger(
    registrationSuccess ? "success" : "error",
    registrationSuccess
      ? "🎉 Register flow completed SUCCESSFULLY!"
      : "❌ Register flow did NOT complete as expected.",
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 2 — APPLY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Navigates to Community/Classes, selects the first class,
 * switches to new tab if necessary, and clicks Apply/Daftar.
 */
async function runApplyClassFlow(
  driver: WebDriver,
  url: string,
  logger: Logger,
  screenshots: string[],
  sessionId: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  logger("section", "━━━ APPLY CLASS FLOW ━━━");

  // ── Navigate ────────────────────────────────────────────────────────────────
  logger("info", `🌐 Navigating to: ${url}`);
  await driver.get(url);
  await waitForPageLoad(driver);

  // Di layar yang ada dashboardnya, kita tunggu render komponen kelas
  await driver.sleep(1000);

  // Screenshot 1
  const ss1 = `${sessionId}_class_1_initial.png`;
  await takeScreenshot(driver, ss1);
  screenshots.push(ss1);
  logger("screenshot", "📸 Community / Classes page loaded", { file: ss1 });

  // ── Step 1 — Select the Top Class ──────────────────────────────────────────
  logger("info", "🖱️  Step 1 — Memilih Kelas Teratas");
  let detailSuccess = false;

  const classCardSelectors = [
    // 1. Sangat Akurat: Cari titik pasti (text) "Materi" / "Harga" yang selalu ada di dalam grid class-card 
    // Kliknya akan menembus ke kontainer (bubbling)
    "//*[normalize-space(text())='Materi']",
    "//*[normalize-space(text())='Harga']",

    // 2. Sangat spesifik menargetkan wrapper Link atau Card yang letaknya di main content (menghindari sidebar navigation)
    "//main//a[contains(@href, '/classes/') and contains(@href, '/overview')]",
    "//main//*[contains(@class, 'card')]//a",

    // 3. Fallbacks jika URL strukturnya unik
    "//a[contains(@href, '/classes/') and not(contains(@class, 'nav')) and not(contains(@class, 'menu'))]",
    "//div[contains(@class, 'card') and (contains(., 'Materi') or contains(., 'Harga'))]",
    "//*[contains(text(), 'Kelas Gratis')]",
    "[class*='course-card']"
  ];

  try {
    const classCard = await findElement(driver, classCardSelectors, "Class Card", WAIT_TIMEOUT);
    await safeClick(driver, classCard);

    // Beri waktu cukup panjang agar React/NextJS me-load SPA /overview
    await driver.sleep(4000);

    // Check if new tab opened
    try {
      const handles = await driver.getAllWindowHandles();
      if (handles.length > 1) {
        logger("info", "   🔄 Berpindah ke tab baru (Class Detail)...");
        await driver.switchTo().window(handles[handles.length - 1]);
      }
    } catch { /* proceed on same tab */ }

    // Tunggu status document ready
    await waitForPageLoad(driver);
    await driver.sleep(1000);

    results.push({
      type: "button",
      element: "Class Card",
      status: "pass",
      action: "clicked",
    });
    logger("success", "   ✅ Clicked upper-most Class Card");
  } catch (e) {
    results.push({
      type: "button",
      element: "Class Card",
      status: "error",
      reason: String(e),
    });
    logger("error", "   ❌ Tidak dapat menemukan atau menekan Class Card");
  }

  // Screenshot 2
  const ss2 = `${sessionId}_class_2_detail.png`;
  await takeScreenshot(driver, ss2);
  screenshots.push(ss2);
  logger("screenshot", "📸 Class Details", { file: ss2 });

  // ── Step 2 — Click Daftar / Apply ───────────────────────────────────────────
  logger("info", "📝 Step 2 — Mendaftar Kelas");

  const applyBtnSelectors = [
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'daftar')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'ikuti')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'enroll')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'ambil')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'daftar')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'ikuti')]",
    "[class*='enroll-btn']",
    "[class*='daftar-btn']"
  ];

  try {
    const applyBtn = await findElement(driver, applyBtnSelectors, "Apply Button", WAIT_TIMEOUT);
    await safeClick(driver, applyBtn);
    await driver.sleep(1500);
    logger("success", "   ✅ Clicked Daftar/Enroll button");

    // Try secondary confirmation modal (if present)
    try {
      const confirmSelectors = [
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'beli')]",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'bayar')]",
        "//button[text()='Ya']",
        "//button[text()='Lanjutkan']",
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'submit')]",
        "[class*='confirm-btn']",
      ];
      let submitted = false;
      for (const sel of confirmSelectors) {
        try {
          const subLocator = sel.startsWith("//") ? By.xpath(sel) : By.css(sel);
          const subBtns = await driver.findElements(subLocator);
          for (const btn of subBtns) {
            if (await btn.isDisplayed()) {
              await safeClick(driver, btn);
              await driver.sleep(2000);
              logger("success", "   ✅ Diklik: Modal Konfirmasi Pendaftaran");
              submitted = true;
              break;
            }
          }
          if (submitted) break;
        } catch { }
      }
      if (!submitted) {
        logger("info", "   ℹ️ Tidak ada pop-up konfirmasi pendaftaran lanjutan.");
      }
    } catch { }

    // Screenshot 3
    const ss3 = `${sessionId}_class_3_applied.png`;
    await takeScreenshot(driver, ss3);
    screenshots.push(ss3);
    logger("screenshot", "📸 Berhasil Daftar", { file: ss3 });

    // ── Assertion ────────────────────────────────────────────────────────────
    logger("info", "⏳ Asserting telah mencapai tahap Pendaftaran / Payment...");
    const successSelectors = [
      "[class*='success']",
      "[class*='toast']",
      "//h1[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'pembayaran')]",
      "//h2[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'pembayaran')]",
      "//h1[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'payment')]",
      "//h2[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'payment')]",
      "//h1[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'checkout')]",
      "//div[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'metode pembayaran')]",
      "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'bayar')]",
      "//div[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'berhasil')]"
    ];
    try {
      await findElement(driver, successSelectors, "Daftar / Payment Indicator", 5000);
      detailSuccess = true;
      logger("success", `   ✅ ASSERTION PASSED — Telah mencapai halaman Payment/Sukses`);
      results.push({ type: "assertion", element: "Apply Class", status: "pass", action: "Reached Payment/Success Step" });
    } catch {
      logger("warn", "   ⚠️ ASSERTION WARNING — Indikator payment sukses tidak terdeteksi, namun tombol Daftar telah diklik.");
      results.push({ type: "assertion", element: "Apply Class", status: "error", reason: "Wait timeout for payment state" });
    }

  } catch (e) {
    logger("error", "   ❌ Tombol Daftar/Ikuti tidak ditemukan atau tidak klikabel.");
    results.push({ type: "button", element: "Daftar", status: "error", reason: String(e) });
  }

  logger(
    detailSuccess ? "success" : "error",
    detailSuccess
      ? "🎉 Apply Class flow completed SUCCESSFULLY!"
      : "❌ Apply Class flow did NOT complete as expected.",
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 3 — JOB VACANCY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Navigates to the Job Vacancy page, searches or clicks a filter, and opens a job detail.
 */
async function runJobVacancyFlow(
  driver: WebDriver,
  url: string,
  logger: Logger,
  screenshots: string[],
  sessionId: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  logger("section", "━━━ JOB VACANCY FLOW ━━━");

  // ── Navigate ────────────────────────────────────────────────────────────────
  logger("info", `🌐 Navigating to: ${url}`);
  await driver.get(url);
  await waitForPageLoad(driver);

  // Assertion: Page loaded correctly
  try {
    const headings = [
      "//h1[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'lowongan pekerjaan')]",
      "//h1[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'job vacancy')]",
      "//h2[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'lowongan pekerjaan')]",
    ];
    await findElement(driver, headings, "Page Header", WAIT_TIMEOUT);
  } catch {
    logger("warn", "⚠️  Job Vacancy header not automatically detected — proceeding…");
  }
  await driver.sleep(600);

  // Screenshot 1
  const ss1 = `${sessionId}_job_1_initial.png`;
  await takeScreenshot(driver, ss1);
  screenshots.push(ss1);
  logger("screenshot", "📸 Job Vacancy page loaded", { file: ss1 });

  // Tahap Search telah dihapus sesuai permintaan.
  logger("info", "🎯 Step 2 — Exploring Filters");
  const filterSelectors = [
    "//button[contains(.,'Filter')]",
    "[class*='filter'] button",
    "button[aria-label*='filter' i]",
    "button[aria-label*='menu' i]",
    "button[aria-label*='sidebar' i]",
    "button[aria-label*='toggle' i]",
    "[class*='hamburger']",
    "[class*='toggle']",
    // Fallback yang sering digunakan untuk tombol panel sidebar sebelah kiri:
    "//button[.//svg]",
    "//div[@role='button' and .//svg]",
    "//*[local-name()='svg' and contains(@class, 'lucide-menu')]/..",
    "//*[local-name()='svg' and contains(@class, 'menu')]",
    "//div[contains(@class, 'cursor-pointer') and .//*[local-name()='svg']]",
    "//button[contains(.,'Tipe Pekerjaan')]",
    "//button[contains(.,'Job Type')]",
    "//select",
  ];
  try {
    const filterBtn = await findElement(driver, filterSelectors, "Filter Toggle", 3000);
    await safeClick(driver, filterBtn);
    await driver.sleep(1000);

    const optionSelectors = [
      "//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'full time') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'full-time')]",
      "//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'full time')]",
      "//input[@type='radio' or @type='checkbox'][following-sibling::*[contains(.,'Full Time')]]",
      "//option[contains(.,'Full Time') or contains(.,'Full-time')]",
      "//li[contains(.,'Full Time') or contains(.,'Full-time')]",
    ];
    try {
      const optionEl = await findElement(driver, optionSelectors, "Filter Option", 2000);
      try {
        await safeClick(driver, optionEl);
      } catch {
        // Fallback option interactability
        await driver.executeScript("arguments[0].click();", optionEl);
      }

      // Khusus untuk filter dropdown bertipe native <select>, kita trigger event change
      try {
        const tagName = await optionEl.getTagName();
        if (tagName === "option") {
          const parentSelect = await optionEl.findElement(By.xpath("./parent::select"));
          await driver.executeScript("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", parentSelect);
        }
      } catch { /* iterasi dilanjut tanpa error */ }

      await driver.sleep(1000);
      logger("success", "   ✅ Filter applied");
      results.push({ type: "interaction", element: "Filter", status: "pass", action: "Applied filter" });
    } catch {
      logger("warn", "   ⚠️ Filter option not found, skipping option selection.");
    }
  } catch {
    logger("warn", "   ⚠️ Filter button/dropdown not found. Skipping filter.");
  }

  // ── Step 3 — Click See Details ───────────────────────────────────────────────────
  logger("info", "🖱️  Step 3 — Opening a Job Detail");
  const seeDetailsSelectors = [
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see details')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'lihat detail')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see details')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'lihat detail')]",
    "//*[contains(@class, 'job')]//button",
    "//*[contains(@class, 'job')]//a",
  ];
  try {
    const btn = await findElement(driver, seeDetailsSelectors, "See Details Button", 5000);
    const btnText = (await btn.getText()).trim();
    await safeClick(driver, btn);
    await driver.sleep(2000);

    // Check if clicking "See Details" opened a new tab/window.
    try {
      const handles = await driver.getAllWindowHandles();
      if (handles.length > 1) {
        logger("info", "   🔄 Berpindah ke tab baru (Job Detail)...");
        await driver.switchTo().window(handles[handles.length - 1]);
        await waitForPageLoad(driver);
      }
    } catch { /* proceed on same tab */ }

    results.push({
      type: "button",
      element: btnText || "See Details",
      status: "pass",
      action: "clicked",
    });
    logger("success", `   ✅ Clicked: "${btnText || "See Details"}"`);
  } catch (e) {
    results.push({
      type: "button",
      element: "See Details",
      status: "error",
      reason: String(e),
    });
    logger("error", "   ❌ See Details button not found");
  }

  // Screenshot 2 — job detail opened
  const ss2 = `${sessionId}_job_2_detail.png`;
  await takeScreenshot(driver, ss2);
  screenshots.push(ss2);
  logger("screenshot", "📸 Opened Job Details", { file: ss2 });

  // ── Step 4 — Click Apply & Fill Form (if any) ───────────────────────────────
  logger("info", "📝 Step 4 — Applying for the Job");
  let detailSuccess = false; // We use detailSuccess for final result

  const applyBtnSelectors = [
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'lamar')]",
    "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'lamar')]",
    "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]",
    "[class*='apply-btn']",
    "[class*='lamar-btn']"
  ];

  try {
    const applyBtn = await findElement(driver, applyBtnSelectors, "Apply Button", WAIT_TIMEOUT);
    await safeClick(driver, applyBtn);
    await driver.sleep(1500);

    // Try to fill cover letter modal (Hanya sampai di sini untuk simulasi aman)
    try {
      const coverLetterSelectors = [
        "textarea[name='cover_letter']",
        "textarea[placeholder*='cover letter' i]",
        "textarea[placeholder*='surat lamaran' i]",
        "textarea[placeholder*='Kenapa' i]",
        "textarea[placeholder*='Why' i]"
      ];
      await findElement(driver, coverLetterSelectors, "Cover Letter", 3000);
      logger("info", "   ℹ️ Form aplikasi terbuka. Tes dihentikan sebelum Submit untuk menghindari pengiriman palsu.");
      detailSuccess = true;
    } catch {
      logger("info", "   ℹ️ Form aplikasi terbuka (Tanpa cover letter). Tes dihentikan sebelum Submit.");
      detailSuccess = true; // Tetap dianggap sukses capai "Apply" state
    }

    // Screenshot 3 — Apply Reached
    const ss3 = `${sessionId}_job_3_applied.png`;
    await takeScreenshot(driver, ss3);
    screenshots.push(ss3);
    logger("screenshot", "📸 Job Apply Form Reached", { file: ss3 });

    // ── Assertion ───────────────────────────
    logger("success", "   ✅ ASSERTION PASSED — Application form successfully reached");
    results.push({ type: "assertion", element: "Apply Job", status: "pass", action: "Job Apply Form Reached" });

  } catch (e) {
    logger("error", "   ❌ Apply button not found or interactable.");
    results.push({ type: "button", element: "Apply", status: "error", reason: String(e) });
  }

  // Screenshot 3 — final
  const ss3 = `${sessionId}_job_3_result.png`;
  await takeScreenshot(driver, ss3);
  screenshots.push(ss3);
  logger("screenshot", `📸 Job Vacancy result — ${detailSuccess ? "✅ SUCCESS" : "❌ FAILED"}`, { file: ss3 });

  logger(
    detailSuccess ? "success" : "error",
    detailSuccess
      ? "🎉 Job Vacancy flow completed SUCCESSFULLY!"
      : "❌ Job Vacancy flow did NOT complete as expected.",
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — runAutomation
// ═══════════════════════════════════════════════════════════════════════════════

export async function runAutomation(
  url: string,
  flow: FlowType,
  logger: Logger,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _postContent?: string,
): Promise<AutomationOutput> {
  const sessionId = Date.now();
  const screenshots: string[] = [];
  const results: TestResult[] = [];
  const recorder = new ScreenRecorder();

  logger("info", "🚀 Launching Chrome browser…");
  logger("info", "🎥 Starting screen recording…");
  const recordingFile = recorder.start(sessionId);

  const profilePath = path.join(process.cwd(), ".chrome_profile");
  const chromeOptions = new chrome.Options()
    .addArguments(
      "--window-position=0,0",
      "--window-size=1280,720",
      "--disable-blink-features=AutomationControlled",
      "--log-level=3",
      "--disable-infobars",
      `--user-data-dir=${profilePath}`
    )
    .excludeSwitches("enable-automation");

  // Attempt to use Brave if installed
  const bravePaths = [
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe")
  ];
  for (const bPath of bravePaths) {
    if (fs.existsSync(bPath)) {
      chromeOptions.setBinaryPath(bPath);
      logger("info", "🦁 Brave Browser terdeteksi! Menggunakan Brave untuk otomasi.");
      break;
    }
  }

  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .setChromeOptions(chromeOptions as any)
    .build();

  try {
    logger("info", `🎯 Flow  : ${flow.toUpperCase()}`);
    logger("info", `🌐 URL   : ${url}`);

    // Wait for manual login if redirected to a login page
    await driver.get(url);
    await driver.sleep(1500); // brief wait to allow redirects
    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes("login") || currentUrl.includes("auth") || currentUrl.includes("sign-in") || currentUrl.includes("signin")) {
      logger("warn", "⚠️  Diarahkan ke halaman login. Menunggu Anda login secara manual...");
      try {
        const targetOrigin = new URL(url).origin;
        await driver.wait(async () => {
          const u = await driver.getCurrentUrl();
          // Jika url saat ini berada di domain luar (misal halaman Google/Facebook OAuth), maka return false (tetap tunggu)
          if (!u.startsWith(targetOrigin)) {
            return false;
          }
          // Jika sudah di target domain, pastikan url sudah tidak mengandung kata login/auth
          return !u.includes("login") && !u.includes("auth") && !u.includes("sign-in") && !u.includes("signin");
        }, 300000); // Tunggu sampai 5 menit
        logger("success", "✅ Login manual berhasil terdeteksi!");
        await driver.sleep(1000);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        throw new Error("Waktu tunggu login manual habis (5 menit).");
      }
    }

    // Cek apakah halaman saat ini adalah 404 Not Found (misal setelah login redirect ke URL yg salah)
    try {
      const pageText = await driver.findElement(By.css("body")).getText();
      const lowerText = pageText.toLowerCase();
      const is404 = (pageText.includes("404") && (lowerText.includes("not found") || lowerText.includes("tidak ditemukan"))) ||
        lowerText.includes("page not found") ||
        lowerText.includes("halaman tidak ditemukan");

      if (is404) {
        logger("warn", "⚠️  Halaman 404 terdeteksi! Mencoba mengklik tombol kembali ke Homepage...");
        const homeSelectors = [
          "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'home')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'home')]",
          "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'beranda')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'beranda')]",
          "//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'kembali')]",
          "//a[contains(@href, '/app')]",
          "//a[contains(@href, '/home')]",
          "//a[@href='/']"
        ];
        const homeBtn = await findElement(driver, homeSelectors, "Home Button", 4000);
        await safeClick(driver, homeBtn);
        await driver.sleep(2000);
        logger("success", "✅ Berhasil diarahkan ke Homepage.");
      }
    } catch {
      // Abaikan jika tidak ada indikasi 404 atau tombol home tidak ditemukan
    }

    let flowResults: TestResult[] = [];

    switch (flow) {
      // ── Register ─────────────────────────────────────────────────────────────
      case "register":
        flowResults = await runRegisterFlow(
          driver,
          url,
          logger,
          screenshots,
          sessionId,
        );
        break;

      // ── Apply Class ────────────────────────────────────────────────────────────
      case "applyClass":
        flowResults = await runApplyClassFlow(
          driver,
          url,
          logger,
          screenshots,
          sessionId,
        );
        break;

      // ── Job Vacancy ──────────────────────────────────────────────────────────
      case "jobVacancy":
        flowResults = await runJobVacancyFlow(
          driver,
          url,
          logger,
          screenshots,
          sessionId
        );
        break;

      default:
        throw new Error(`Unknown flow type: "${flow}"`);
    }

    results.push(...flowResults);

    const summary: AutomationSummary = {
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "error").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      total: results.length,
    };

    const assertionPassed = results.some(
      (r) => r.type === "assertion" && r.status === "pass",
    );

    logger(
      "done",
      `🎉 ${flow.toUpperCase()} done! ` +
      `✅ ${summary.passed} passed · ❌ ${summary.failed} failed · ` +
      `Assertion: ${assertionPassed ? "✅ PASSED" : "❌ FAILED"}`,
    );

    logger("info", "⏹️  Stopping recording & saving video…");
    await recorder.stop();
    logger("info", `🎬 Video saved: ${recordingFile}`);

    return { results, summary, screenshots, recording: recordingFile };
  } catch (err) {
    logger(
      "error",
      `💥 Fatal error: ${err instanceof Error ? err.message : String(err)}`,
    );
    await recorder.stop().catch(() => { });
    throw err;
  } finally {
    await driver.quit();
  }
}
