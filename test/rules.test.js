const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyActivity, nextIntervention } = require("../src/rules");

test("blocked keywords take priority", () => {
  const result = classifyActivity(
    { processName: "chrome", title: "Bilibili - project tutorial" },
    { allowedKeywords: "project", blockedKeywords: "bilibili" }
  );
  assert.equal(result.verdict, "distracted");
});

test("allowed keywords mark focused activity", () => {
  const result = classifyActivity(
    { processName: "Code", title: "AI Friend - Visual Studio Code" },
    { allowedKeywords: "code, ai friend", blockedKeywords: "steam" }
  );
  assert.equal(result.verdict, "focused");
});

test("interventions escalate gradually", () => {
  assert.equal(nextIntervention(0), "none");
  assert.equal(nextIntervention(1), "nudge");
  assert.equal(nextIntervention(3), "checkin");
  assert.equal(nextIntervention(6), "block");
});
