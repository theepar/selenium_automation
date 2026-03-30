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

  /**
   * Skip country-code dropdown — just select all existing content in the
   * phone input and overwrite with the full +62 number directly.
   */
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
  const fullPhone = `+62${data.phone}`;
  try {
    const el = await findElement(driver, phoneSelectors, "Phone");
    await driver.wait(until.elementIsVisible(el), WAIT_TIMEOUT);
    await safeClick(driver, el);
    await driver.sleep(300);
    // Select all (Ctrl+A) then type the full number to overwrite
    const { Key } = await import("selenium-webdriver");
    await el.sendKeys(Key.chord(Key.CONTROL, "a"));
    await driver.sleep(100);
    await el.sendKeys(fullPhone);
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
      action: `filled: "${fullPhone}"`,
    });
    logger("success", `   ✅ Phone filled: ${fullPhone}`);
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
// FLOW 2 — LOGIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fills the login form with provided credentials and asserts a successful
 * redirect away from the login page.
 */
async function runLoginFlow(
  driver: WebDriver,
  url: string,
  credentials: Credentials,
  logger: Logger,
  screenshots: string[],
  sessionId: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  logger("section", "━━━ LOGIN FLOW ━━━");
  logger("info", `📋 Credentials: ${credentials.email}`);

  // ── Navigate ────────────────────────────────────────────────────────────────
  logger("info", `🌐 Navigating to: ${url}`);
  await driver.get(url);
  await waitForPageLoad(driver);

  // 🔧 ADJUST: update the selector if the login form has a unique wrapper.
  try {
    await driver.wait(
      until.elementLocated(
        By.css('form, [class*="login"], [class*="signin"], [class*="auth"]'),
      ),
      WAIT_TIMEOUT,
    );
  } catch {
    logger("warn", "⚠️  Login form container not detected — proceeding…");
  }
  await driver.sleep(600);

  // Screenshot ① — login page
  const ss1 = `${sessionId}_login_1_initial.png`;
  await takeScreenshot(driver, ss1);
  screenshots.push(ss1);
  logger("screenshot", "📸 Login page loaded", { file: ss1 });

  // ── Step 1 / 3 — Email ──────────────────────────────────────────────────────
  logger("info", "✏️  Step 1/3 — Email / Username");
  /**
   * 🔧 ADJUST SELECTOR — Email or username field on the login page.
   */
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[id="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[placeholder*="surel" i]',
  ];
  try {
    const el = await findElement(driver, emailSelectors, "Email/Username");
    await safeFill(driver, el, credentials.email);
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "input[email]",
      element: "email",
      status: "pass",
      action: `filled: "${credentials.email}"`,
    });
    logger("success", `   ✅ Email filled: "${credentials.email}"`);
  } catch (e) {
    results.push({
      type: "input[email]",
      element: "email",
      status: "error",
      reason: String(e),
    });
    logger("warn", "   ⚠️  Email field not found — adjust emailSelectors");
  }

  // ── Step 2 / 3 — Password ───────────────────────────────────────────────────
  logger("info", "✏️  Step 2/3 — Password");
  /**
   * 🔧 ADJUST SELECTOR — Password field on the login page.
   */
  try {
    const pwInput = await driver.wait(
      until.elementLocated(By.css('input[type="password"]')),
      WAIT_TIMEOUT,
    );
    await driver.wait(until.elementIsVisible(pwInput), WAIT_TIMEOUT);
    await safeFill(driver, pwInput, credentials.password);
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
    logger("warn", "   ⚠️  Password field not found");
  }

  // Screenshot ② — form filled
  const ss2 = `${sessionId}_login_2_filled.png`;
  await takeScreenshot(driver, ss2);
  screenshots.push(ss2);
  logger("screenshot", "📸 Credentials filled — about to submit", {
    file: ss2,
  });

  // ── Step 3 / 3 — Click Login ─────────────────────────────────────────────────
  logger("info", "🖱️  Step 3/3 — Clicking Login button…");
  /**
   * 🔧 ADJUST SELECTOR — Login submit button.
   */
  const loginBtnSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'login')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'sign in')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'masuk')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'log in')]",
  ];
  try {
    const btn = await findElement(driver, loginBtnSelectors, "Login Button");
    const btnText = (await btn.getText()).trim();
    await safeClick(driver, btn);
    results.push({
      type: "button",
      element: btnText || "Login",
      status: "pass",
      action: "clicked",
    });
    logger("success", `   ✅ Clicked: "${btnText || "Login"}"`);
  } catch (e) {
    results.push({
      type: "button",
      element: "Login",
      status: "error",
      reason: String(e),
    });
    logger("error", "   ❌ Login button not found");
  }

  // ── Assertion — URL should leave /login ─────────────────────────────────────
  logger("info", "⏳ Asserting login success…");
  await driver.sleep(2_000);
  let loginSuccess = false;

  // Assertion ①: URL no longer contains /login or /signin
  try {
    /**
     * 🔧 ADJUST: extend the negative-match patterns if the login URL differs.
     */
    await driver.wait(async () => {
      const cur = await driver.getCurrentUrl().then((u) => u.toLowerCase());
      return !cur.includes("/login") && !cur.includes("/signin");
    }, WAIT_TIMEOUT);

    const finalUrl = await driver.getCurrentUrl();
    loginSuccess = true;
    logger("success", `   ✅ ASSERTION PASSED — logged in! URL: "${finalUrl}"`);
    results.push({
      type: "assertion",
      element: "Login redirect",
      status: "pass",
      action: `Redirected to: ${finalUrl}`,
    });
  } catch {
    // Assertion ②: a post-login UI element is present
    try {
      /**
       * 🔧 ADJUST SELECTOR — elements that only appear when authenticated.
       */
      const dashboardSelectors = [
        "[class*='dashboard']",
        "[class*='feed']",
        "[class*='home']",
        "nav [class*='avatar']",
        "[aria-label*='profile' i]",
        "[aria-label*='account' i]",
        "[class*='user-menu']",
        "[class*='navbar'] img",
      ];
      await findElement(
        driver,
        dashboardSelectors,
        "Post-login element",
        WAIT_TIMEOUT,
      );
      loginSuccess = true;
      logger(
        "success",
        "   ✅ ASSERTION PASSED — authenticated UI element found",
      );
      results.push({
        type: "assertion",
        element: "Dashboard element",
        status: "pass",
        action: "Post-login element visible",
      });
    } catch {
      logger("error", "   ❌ ASSERTION FAILED — login did not succeed.");
      results.push({
        type: "assertion",
        element: "Login success",
        status: "error",
        reason: "No post-login indicator found",
      });
    }
  }

  // Screenshot ③ — final
  const ss3 = `${sessionId}_login_3_result.png`;
  await takeScreenshot(driver, ss3);
  screenshots.push(ss3);
  logger(
    "screenshot",
    `📸 Login result — ${loginSuccess ? "✅ SUCCESS" : "❌ FAILED"}`,
    { file: ss3 },
  );

  logger(
    loginSuccess ? "success" : "error",
    loginSuccess
      ? "🎉 Login flow completed SUCCESSFULLY!"
      : "❌ Login flow did NOT complete as expected.",
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 3 — POST FEED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logs in, navigates to the feed, composes a new post, submits it,
 * and asserts that the post was created successfully.
 */
async function runPostFeedFlow(
  driver: WebDriver,
  url: string,
  credentials: Credentials,
  postContent: string,
  logger: Logger,
  screenshots: string[],
  sessionId: number,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  logger("section", "━━━ POST FEED FLOW ━━━");
  logger("info", `📋 Account  : ${credentials.email}`);
  logger("info", `📝 Content  : "${postContent.slice(0, 60)}…"`);

  // ── Phase 1 — Login ─────────────────────────────────────────────────────────
  logger("section", "── Phase 1: Login ──");
  const loginResults = await runLoginFlow(
    driver,
    url,
    credentials,
    logger,
    screenshots,
    sessionId,
  );
  results.push(...loginResults);

  const loginSuccess = loginResults.some(
    (r) => r.type === "assertion" && r.status === "pass",
  );
  if (!loginSuccess) {
    logger("error", "❌ Login failed — cannot continue to Post Feed.");
    results.push({
      type: "assertion",
      element: "Post Feed — login prerequisite",
      status: "error",
      reason: "Login step failed",
    });
    return results;
  }

  // ── Phase 2 — Navigate to feed ──────────────────────────────────────────────
  logger("section", "── Phase 2: Find Feed Page ──");
  const origin = new URL(url).origin;

  /**
   * 🔧 ADJUST: put the real SocialVit feed URL first in this list.
   */
  const feedCandidates = [
    `${origin}/app/feed`,
    `${origin}/app/home`,
    `${origin}/app`,
    `${origin}/feed`,
    `${origin}/home`,
    `${origin}/`,
  ];

  /**
   * 🔧 ADJUST SELECTOR — element that marks "this is the feed page".
   */
  const postAreaIndicators = [
    "textarea[placeholder*='post' i]",
    "textarea[placeholder*='mind' i]",
    "textarea[placeholder*='apa' i]",
    "[class*='create-post']",
    "[class*='post-box']",
    "[class*='new-post']",
    "[class*='compose']",
    "[contenteditable='true']",
    "[class*='post'] textarea",
  ];

  let feedFound = false;
  for (const feedUrl of feedCandidates) {
    try {
      await driver.get(feedUrl);
      await waitForPageLoad(driver);
      try {
        await findElement(
          driver,
          postAreaIndicators,
          "Post area indicator",
          3_000,
        );
        feedFound = true;
        logger("success", `   ✅ Feed found at: ${feedUrl}`);
        break;
      } catch {
        logger("info", `   ⏭️  No post area at ${feedUrl}, trying next…`);
      }
    } catch {
      /* navigation failed, try next */
    }
  }

  if (!feedFound) {
    logger(
      "warn",
      "⚠️  Could not auto-detect feed page — will try current page.",
    );
  }

  // Screenshot ① — feed page
  const ss1 = `${sessionId}_post_1_feed.png`;
  await takeScreenshot(driver, ss1);
  screenshots.push(ss1);
  logger("screenshot", "📸 Feed page", { file: ss1 });

  // ── Phase 3 — Compose post ──────────────────────────────────────────────────
  logger("section", "── Phase 3: Compose & Submit Post ──");

  // Some UIs need a "Create Post" button click to reveal the textarea/modal.
  /**
   * 🔧 ADJUST SELECTOR — optional trigger button that opens the compose UI.
   */
  const postTriggerSelectors = [
    "[class*='create-post'] button",
    "[class*='new-post'] button",
    "[class*='add-post']",
    "button[aria-label*='post' i]",
    "button[aria-label*='create' i]",
    "//button[contains(.,'Create Post')]",
    "//button[contains(.,'Buat Postingan')]",
    "//button[contains(.,'Tambah')]",
  ];
  try {
    const trigger = await findElement(
      driver,
      postTriggerSelectors,
      "Post trigger",
      3_000,
    );
    await safeClick(driver, trigger);
    await driver.sleep(800);
    logger("info", "   ✅ Clicked post creation trigger");
  } catch {
    logger("info", "   ℹ️  No trigger button found — trying direct textarea");
  }

  // Fill the post content
  /**
   * 🔧 ADJUST SELECTOR — the actual text entry for the post content.
   */
  const postInputSelectors = [
    "textarea[placeholder*='post' i]",
    "textarea[placeholder*='mind' i]",
    "textarea[placeholder*='apa' i]",
    "textarea[placeholder*='tulis' i]",
    "[contenteditable='true']",
    "[class*='post'] textarea",
    "[class*='compose'] textarea",
    "[class*='editor'] [contenteditable]",
    "textarea",
  ];
  try {
    const postInput = await findElement(
      driver,
      postInputSelectors,
      "Post input",
    );

    const tagName = await postInput.getTagName();
    if (tagName === "textarea") {
      await safeFill(driver, postInput, postContent);
    } else {
      // contenteditable element
      await driver.executeScript(
        "arguments[0].innerText = arguments[1]",
        postInput,
        postContent,
      );
      await postInput.click();
      await driver.executeScript(
        "arguments[0].dispatchEvent(new Event('input', { bubbles: true }))",
        postInput,
      );
    }
    await driver.sleep(STEP_DELAY);
    results.push({
      type: "textarea",
      element: "post_content",
      status: "pass",
      action: `filled: "${postContent.slice(0, 50)}…"`,
    });
    logger("success", "   ✅ Post content filled");
  } catch (e) {
    results.push({
      type: "textarea",
      element: "post_content",
      status: "error",
      reason: String(e),
    });
    logger(
      "warn",
      "   ⚠️  Could not fill post input — adjust postInputSelectors",
    );
  }

  // Screenshot ② — post composed
  const ss2 = `${sessionId}_post_2_composed.png`;
  await takeScreenshot(driver, ss2);
  screenshots.push(ss2);
  logger("screenshot", "📸 Post composed — about to submit", { file: ss2 });

  // Submit
  logger("info", "🖱️  Submitting post…");
  /**
   * 🔧 ADJUST SELECTOR — the submit button for the post.
   */
  const postSubmitSelectors = [
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'post')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'publish')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'share')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'kirim')]",
    "//button[contains(translate(.,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'bagikan')]",
    "[class*='post-btn']",
    "[class*='submit-post']",
    'button[type="submit"]',
  ];
  try {
    const submitBtn = await findElement(
      driver,
      postSubmitSelectors,
      "Post submit",
    );
    const btnText = (await submitBtn.getText()).trim();
    await safeClick(driver, submitBtn);
    await driver.sleep(2_000);
    results.push({
      type: "button",
      element: btnText || "Post",
      status: "pass",
      action: "clicked",
    });
    logger("success", `   ✅ Submitted: "${btnText || "Post"}"`);
  } catch (e) {
    results.push({
      type: "button",
      element: "Post submit",
      status: "error",
      reason: String(e),
    });
    logger("error", "   ❌ Post submit button not found");
  }

  // ── Assertion — confirm post was created ─────────────────────────────────────
  logger("info", "⏳ Asserting post was created…");
  let postSuccess = false;

  // Assertion ①: success toast / notification
  try {
    /**
     * 🔧 ADJUST SELECTOR — success notification after posting.
     */
    const successSelectors = [
      "[class*='success']",
      "[class*='toast']",
      "[class*='notification']",
      "[role='alert']",
      "//div[contains(.,'posted') or contains(.,'published') or contains(.,'shared')]",
      "//div[contains(.,'berhasil') and (contains(.,'post') or contains(.,'kirim'))]",
    ];
    const successEl = await findElement(
      driver,
      successSelectors,
      "Post success toast",
      WAIT_TIMEOUT,
    );
    const txt = (await successEl.getText()).trim();
    postSuccess = true;
    logger("success", `   ✅ ASSERTION PASSED — toast: "${txt}"`);
    results.push({
      type: "assertion",
      element: "Post success toast",
      status: "pass",
      action: `Found: "${txt}"`,
    });
  } catch {
    // Assertion ②: the post text appears in the feed
    try {
      const snippet = postContent.slice(0, 20).replace(/"/g, '\\"');
      const postInFeed = await driver.wait(
        until.elementLocated(By.xpath(`//*[contains(., "${snippet}")]`)),
        5_000,
      );
      await driver.wait(until.elementIsVisible(postInFeed), 3_000);
      postSuccess = true;
      logger(
        "success",
        "   ✅ ASSERTION PASSED — post content visible in feed",
      );
      results.push({
        type: "assertion",
        element: "Post in feed",
        status: "pass",
        action: "Post content visible in feed",
      });
    } catch {
      logger("error", "   ❌ ASSERTION FAILED — post creation not confirmed.");
      results.push({
        type: "assertion",
        element: "Post created",
        status: "error",
        reason: "No success indicator found",
      });
    }
  }

  // Screenshot ③ — final
  const ss3 = `${sessionId}_post_3_result.png`;
  await takeScreenshot(driver, ss3);
  screenshots.push(ss3);
  logger(
    "screenshot",
    `📸 Post feed result — ${postSuccess ? "✅ SUCCESS" : "❌ FAILED"}`,
    { file: ss3 },
  );

  logger(
    postSuccess ? "success" : "error",
    postSuccess
      ? "🎉 Post Feed flow completed SUCCESSFULLY!"
      : "❌ Post Feed flow did NOT complete as expected.",
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
  credentials?: { email?: string; password?: string },
  postContent?: string,
): Promise<AutomationOutput> {
  const sessionId = Date.now();
  const screenshots: string[] = [];
  const results: TestResult[] = [];
  const recorder = new ScreenRecorder();

  logger("info", "🚀 Launching Chrome browser…");
  logger("info", "🎥 Starting screen recording…");
  const recordingFile = recorder.start(sessionId);

  const chromeOptions = new chrome.Options()
    .addArguments(
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--log-level=3",
      "--disable-infobars",
    )
    .excludeSwitches("enable-automation");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driver: WebDriver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(chromeOptions as any)
    .build();

  try {
    logger("info", `🎯 Flow  : ${flow.toUpperCase()}`);
    logger("info", `🌐 URL   : ${url}`);

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

      // ── Login ────────────────────────────────────────────────────────────────
      case "login":
        if (!credentials?.email || !credentials?.password) {
          throw new Error(
            'Login flow requires both "email" and "password" credentials.',
          );
        }
        flowResults = await runLoginFlow(
          driver,
          url,
          { email: credentials.email, password: credentials.password },
          logger,
          screenshots,
          sessionId,
        );
        break;

      // ── Post Feed ────────────────────────────────────────────────────────────
      case "postFeed":
        if (!credentials?.email || !credentials?.password) {
          throw new Error(
            'Post Feed flow requires both "email" and "password" credentials.',
          );
        }
        flowResults = await runPostFeedFlow(
          driver,
          url,
          { email: credentials.email, password: credentials.password },
          postContent?.trim() ||
          "Test post from NexusAuto QA Platform 🤖 #automation #testing",
          logger,
          screenshots,
          sessionId,
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
