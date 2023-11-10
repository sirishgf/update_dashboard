const {checkEventType} = require("../index");

describe("Update Dashboard TestCases", () => {
  test("Check Event Type", () => {
    expect(checkEventType({"before": {"exists": true}, "after": {"exists": false}})).toBe("a");
  });
});
