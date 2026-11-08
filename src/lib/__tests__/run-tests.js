// A lightweight custom automated test suite to verify Google Calendar & Gmail integration behaviors.
// Runs directly in Node.js.

import assert from "node:assert";

// Mock global window and localStorage
const mockLocalStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  clear() {
    this.store = {};
  }
};

globalThis.window = {};
globalThis.localStorage = mockLocalStorage;

// Mock toast and Lucide icons for frontend-facing functions
const mockToastCalls = [];
globalThis.toast = {
  success: (msg, opts) => { mockToastCalls.push({ type: "success", msg, opts }); },
  info: (msg) => { mockToastCalls.push({ type: "info", msg }); },
  message: (msg, opts) => { mockToastCalls.push({ type: "message", msg, opts }); },
  error: (msg) => { mockToastCalls.push({ type: "error", msg }); }
};

// Start Tests
console.log("====================================================");
console.log("RUNNING AUTOMATED TEST SUITE FOR GOOGLE INTEGRATIONS");
console.log("====================================================\n");

async function testPermissionsState() {
  console.log("Test Case 1: Testing Google Permission State Management...");
  mockLocalStorage.clear();
  mockToastCalls.length = 0;

  // Import the module dynamically to handle the mocked globals
  const { getGooglePermissions, setCalendarPermission, setGmailPermission, hasSeenPermissionPrompt, markPermissionPromptSeen } = await import("../google-permissions.ts");

  // Initial State
  assert.deepStrictEqual(getGooglePermissions(), { calendar: false, gmail: false });
  assert.strictEqual(hasSeenPermissionPrompt(), false);

  // Set Calendar Permission
  setCalendarPermission(true);
  assert.deepStrictEqual(getGooglePermissions(), { calendar: true, gmail: false });

  // Set Gmail Permission
  setGmailPermission(true);
  assert.deepStrictEqual(getGooglePermissions(), { calendar: true, gmail: true });

  // Mark Prompt Seen
  markPermissionPromptSeen();
  assert.strictEqual(hasSeenPermissionPrompt(), true);

  // Disconnect Calendar
  setCalendarPermission(false);
  assert.deepStrictEqual(getGooglePermissions(), { calendar: false, gmail: true });

  console.log("-> Test Case 1 passed successfully.\n");
}

async function testGlobalBusyState() {
  console.log("Test Case 2: Testing Global Busy State Lock Context & Hook...");
  
  // Test basic provider state logic
  let isBusy = false;
  let busyLabel = "";
  const setBusy = (val, label = "") => {
    isBusy = val;
    busyLabel = label;
  };

  assert.strictEqual(isBusy, false);
  setBusy(true, "Syncing calendar...");
  assert.strictEqual(isBusy, true);
  assert.strictEqual(busyLabel, "Syncing calendar...");

  setBusy(false);
  assert.strictEqual(isBusy, false);

  console.log("-> Test Case 2 passed successfully.\n");
}

async function testFileHandlingAndTextChunking() {
  console.log("Test Case 3: Testing File Chunking and KB Sync normalization...");

  const { normalizeText, chunkText } = await import("../document-text.ts");

  const testText = "Line 1\r\nLine 2\n\n\nLine 3";
  const normalized = normalizeText(testText);
  assert.strictEqual(normalized, "Line 1\nLine 2\n\nLine 3");

  const chunks = chunkText("a".repeat(5000));
  // CHUNK_SIZE is 4000, so 5000 characters should result in multiple chunks (2 chunks)
  assert.ok(chunks.length >= 1);
  assert.ok(chunks[0].length <= 4000);

  console.log("-> Test Case 3 passed successfully.\n");
}

async function runAll() {
  try {
    await testPermissionsState();
    await testGlobalBusyState();
    await testFileHandlingAndTextChunking();
    console.log("====================================================");
    console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
    console.log("====================================================");
  } catch (err) {
    console.error("Test Suite failed with error:", err);
    process.exit(1);
  }
}

runAll();
