/** CRM-level confidence label per the spec's bands. */
export function confidenceLabel(score: number): string {
  if (score >= 90) return "Very High";
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

/** Boost confidence when multiple distinct providers agree on the same email/phone. */
export function boostForAgreement(baseConfidence: number, agreeingProviderCount: number): number {
  if (agreeingProviderCount <= 1) return baseConfidence;
  const boost = Math.min(15, (agreeingProviderCount - 1) * 8);
  return Math.min(100, baseConfidence + boost);
}
