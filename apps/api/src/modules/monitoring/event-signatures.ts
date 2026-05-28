import { toEventSelector, toFunctionSelector } from "viem";

export const COMMON_EVENT_SIGNATURES = {
  OwnershipTransferred: "OwnershipTransferred(address,address)",
  RoleGranted: "RoleGranted(bytes32,address,address)",
  RoleRevoked: "RoleRevoked(bytes32,address,address)",
  AdminChanged: "AdminChanged(address,address)",
  Upgraded: "Upgraded(address)",
  Paused: "Paused(address)",
  Unpaused: "Unpaused(address)",
  Transfer: "Transfer(address,address,uint256)",
  Burn: "Burn(address,uint256,uint256,address)",
  Sync: "Sync(uint112,uint112)"
} as const;

export const COMMON_EVENT_TOPICS = Object.fromEntries(
  Object.entries(COMMON_EVENT_SIGNATURES).map(([name, signature]) => [name, toEventSelector(signature)])
) as Record<keyof typeof COMMON_EVENT_SIGNATURES, `0x${string}`>;

export const ADMIN_FUNCTION_SELECTORS = {
  upgradeTo: toFunctionSelector("upgradeTo(address)"),
  upgradeToAndCall: toFunctionSelector("upgradeToAndCall(address,bytes)"),
  transferOwnership: toFunctionSelector("transferOwnership(address)"),
  renounceOwnership: toFunctionSelector("renounceOwnership()"),
  grantRole: toFunctionSelector("grantRole(bytes32,address)"),
  revokeRole: toFunctionSelector("revokeRole(bytes32,address)"),
  pause: toFunctionSelector("pause()"),
  unpause: toFunctionSelector("unpause()"),
  setAdmin: toFunctionSelector("setAdmin(address)")
} as const;

export const COMMON_TOPIC_TO_EVENT_NAME = new Map<string, keyof typeof COMMON_EVENT_SIGNATURES>(
  Object.entries(COMMON_EVENT_TOPICS).map(([name, topic]) => [topic.toLowerCase(), name as keyof typeof COMMON_EVENT_SIGNATURES])
);
