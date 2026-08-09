function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function recentOfficialPitchCount(player, currentDay, windowDays = 7) {
    const earliestDay = currentDay - windowDays + 1;
    return player.pitchingLog
        .filter((entry) => entry.official && entry.day >= earliestDay && entry.day <= currentDay)
        .reduce((sum, entry) => sum + entry.pitches, 0);
}
export function isPitcherRuleEligible(player, currentDay, pitchLimit = 500, windowDays = 7) {
    return recentOfficialPitchCount(player, currentDay, windowDays) < pitchLimit;
}
export function appropriatePitchCount(player) {
    return 45 + player.pitching.stamina * 0.65;
}
export function dangerPitchCount(player) {
    return appropriatePitchCount(player) + 25;
}
export function recoverPlayerForDays(player, days) {
    if (days <= 0)
        return;
    const dailyRecovery = 8 + player.pitching.stamina * 0.1;
    player.health.fatigue = clamp(player.health.fatigue - dailyRecovery * days, 0, 100);
    if (player.health.fatigue < 20 && player.health.injuredUntilDay < 0) {
        player.health.injuryRisk = "low";
    }
}
export function outingFatigueIncrease(player, pitches, restDays) {
    const target = appropriatePitchCount(player);
    const restMultiplier = restDays <= 0 ? 1.35 : restDays === 1 ? 1.15 : 1;
    return (pitches / Math.max(45, target)) * 38 * restMultiplier;
}
export function healthRiskForPitcher(player, projectedAdditionalPitches = 0) {
    const projectedFatigue = player.health.fatigue +
        (projectedAdditionalPitches / Math.max(45, appropriatePitchCount(player))) * 38;
    const projectedTotal = projectedAdditionalPitches;
    const target = appropriatePitchCount(player);
    const danger = dangerPitchCount(player);
    if (projectedFatigue >= 82 || projectedTotal >= danger + 15)
        return "danger";
    if (projectedFatigue >= 62 || projectedTotal >= danger)
        return "high";
    if (projectedFatigue >= 38 || projectedTotal >= target)
        return "caution";
    return "low";
}
export function riskRank(risk) {
    return { low: 0, caution: 1, high: 2, danger: 3 }[risk];
}
