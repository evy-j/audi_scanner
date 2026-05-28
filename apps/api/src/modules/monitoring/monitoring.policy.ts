export const MONITORING_SAFETY_POLICY = {
  readOnly: true,
  transactionSigning: false,
  privateKeyCollection: false,
  seedPhraseCollection: false,
  automaticMitigationExecution: false,
  liveAttackExecution: false,
  fabricatedAlerts: false,
  defamatoryWalletIdentityClaims: false,
  evidenceRequiredForAlerts: true,
  defaultEnabled: false,
  warning:
    "Monitoring is read-only. It never signs transactions, collects private keys, executes mitigations, or fabricates alerts."
} as const;

export function monitoringDisabledState() {
  return {
    enabled: false,
    status: "DISABLED",
    warning: MONITORING_SAFETY_POLICY.warning
  };
}
