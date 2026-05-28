import { describe, expect, it } from "vitest";

const requiredSandboxControls = {
  networkMode: "none",
  ipcMode: "none",
  readOnlyRootFilesystem: true,
  noNewPrivileges: true,
  dockerPullPolicy: "never",
  containerUser: "10001:10001",
  disableSwap: true,
  tmpfsNoExec: true
};

describe("sandbox security controls", () => {
  it("keeps the minimum sandbox control baseline explicit", () => {
    expect(requiredSandboxControls).toMatchObject({
      networkMode: "none",
      ipcMode: "none",
      readOnlyRootFilesystem: true,
      noNewPrivileges: true,
      dockerPullPolicy: "never",
      containerUser: "10001:10001",
      disableSwap: true,
      tmpfsNoExec: true
    });
  });
});
