import { recoverPlayerForDays } from "./workload.js";
const BATTING_KEYS = ["contact", "power", "speed", "fielding", "arm"];
const PITCHING_KEYS = ["stuff", "control", "breaking", "stamina"];
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function styleMultiplier(style, key) {
    if (style === "balanced")
        return 1;
    if (style === "contact" && key === "contact")
        return 1.28;
    if (style === "power" && key === "power")
        return 1.28;
    if (style === "speed" && key === "speed")
        return 1.28;
    if (style === "defense" && (key === "fielding" || key === "arm"))
        return 1.18;
    if (style === "pitching" && key === "fielding")
        return 1.12;
    return 0.95;
}
function pitchingStyleMultiplier(style, key) {
    if (style === "pitching")
        return key === "stamina" ? 1.18 : 1.25;
    if (style === "defense" && key === "control")
        return 1.08;
    return 1;
}
function teamFocusMultiplier(focus, key) {
    switch (focus) {
        case "contact": return key === "contact" ? 1.45 : key === "power" ? 1.08 : 0.92;
        case "power": return key === "power" ? 1.5 : key === "contact" ? 1.02 : 0.9;
        case "speed": return key === "speed" ? 1.5 : key === "fielding" ? 1.08 : 0.92;
        case "defense": return key === "fielding" ? 1.42 : key === "arm" ? 1.26 : 0.9;
        case "pitching": return key === "fielding" ? 1.02 : 0.86;
        case "recovery": return 0.2;
        case "balanced": return 1;
    }
}
function pitchingFocusMultiplier(focus, key) {
    if (focus === "pitching")
        return key === "stamina" ? 1.28 : 1.45;
    if (focus === "defense" && key === "control")
        return 1.08;
    if (focus === "recovery")
        return 0.2;
    return focus === "balanced" ? 1 : 0.9;
}
function individualMultiplier(target, key) {
    return target === key ? 1.55 : 1;
}
function growValue(current, hardCap, aptitude, baseGrowth, environment, focus, rng) {
    const remaining = Math.max(0, hardCap - current);
    if (remaining <= 0)
        return current;
    const capFactor = Math.pow(Math.min(1, remaining / 24), 1.15);
    const noise = clamp(rng.normal(1, 0.11), 0.72, 1.28);
    return Math.min(hardCap, current + baseGrowth * aptitude * environment * focus * capFactor * noise);
}
export function recoverPlayerToDay(player, currentDay) {
    const lastEntry = player.pitchingLog[player.pitchingLog.length - 1];
    const lastDay = lastEntry?.day ?? currentDay;
    const days = Math.max(0, currentDay - lastDay);
    const dailyRecovery = 8 + player.pitching.stamina * 0.1;
    player.health.fatigue = clamp(player.health.fatigue - days * dailyRecovery, 0, 100);
    if (player.health.injuredUntilDay <= currentDay)
        player.health.injuryRisk = "low";
}
export function developPlayer(player, team, rng, weekIntensity = 1, focus = "balanced", individualTarget = null) {
    if (!player.active || player.health.injuredUntilDay > 0)
        return;
    const environment = clamp((team.profile.coaching * 0.58 + team.profile.facilities * 0.42) / 70, 0.72, 1.32);
    const healthFactor = clamp(1 - player.health.fatigue / 150, 0.45, 1);
    const baseGrowth = 0.24 * weekIntensity * healthFactor;
    BATTING_KEYS.forEach((key) => {
        const potential = player.battingPotential[key];
        player.batting[key] = growValue(player.batting[key], potential.hardCap, potential.aptitude, baseGrowth, environment, styleMultiplier(team.profile.style, key) *
            teamFocusMultiplier(focus, key) *
            individualMultiplier(individualTarget, key), rng);
    });
    if (player.isPitcherCandidate) {
        PITCHING_KEYS.forEach((key) => {
            const potential = player.pitchingPotential[key];
            player.pitching[key] = growValue(player.pitching[key], potential.hardCap, potential.aptitude, baseGrowth * 1.04, environment, pitchingStyleMultiplier(team.profile.style, key) *
                pitchingFocusMultiplier(focus, key) *
                individualMultiplier(individualTarget, key), rng);
        });
    }
    player.positionAptitudes[player.primaryPosition] = clamp(player.positionAptitudes[player.primaryPosition] + 0.035 * environment * weekIntensity, 0, 100);
}
export function trainPosition(player, position, team, rng, practicalExperience) {
    const difficulty = {
        P: 0.25,
        C: 0.35,
        "1B": 1,
        "2B": 0.7,
        "3B": 0.7,
        SS: 0.45,
        LF: 1,
        CF: 0.7,
        RF: 1,
    };
    const relatedBonus = (player.primaryPosition === "SS" && (position === "2B" || position === "3B")) ||
        (player.primaryPosition === "2B" && position === "SS") ||
        ((player.primaryPosition === "LF" || player.primaryPosition === "CF" || player.primaryPosition === "RF") &&
            (position === "LF" || position === "CF" || position === "RF"))
        ? 1.35
        : 1;
    const environment = (team.profile.coaching + team.profile.facilities) / 140;
    const experience = practicalExperience ? 1.25 : 1;
    const growth = 0.24 * difficulty[position] * relatedBonus * environment * experience *
        clamp(rng.normal(1, 0.1), 0.75, 1.25);
    player.positionAptitudes[position] = clamp(player.positionAptitudes[position] + growth, 0, 100);
    if (position === "P" && player.positionAptitudes.P >= 35) {
        player.isPitcherCandidate = true;
    }
    return growth;
}
export function developTeamForWeek(team, rng, intensity = 1) {
    team.roster.forEach((player) => developPlayer(player, team, rng, intensity));
}
function sumBatting(player) {
    return BATTING_KEYS.reduce((sum, key) => sum + player.batting[key], 0);
}
function sumPitching(player) {
    return PITCHING_KEYS.reduce((sum, key) => sum + player.pitching[key], 0);
}
function loadIntensity(load) {
    return { light: 0.72, normal: 1, heavy: 1.24 }[load];
}
function loadFatigue(load) {
    return { light: 1.5, normal: 4, heavy: 8.5 }[load];
}
function positionFromTarget(target) {
    if (target === null || !target.startsWith("position:"))
        return null;
    return target.slice("position:".length);
}
export function developTeamWithPlan(team, rng, plan, currentDay) {
    const assignmentByPlayer = new Map(plan.assignments.map((assignment) => [assignment.playerId, assignment.target]));
    const results = [];
    team.roster.forEach((player) => {
        const beforeBatting = sumBatting(player);
        const beforePitching = sumPitching(player);
        const beforeFatigue = player.health.fatigue;
        const target = assignmentByPlayer.get(player.id) ?? null;
        let positionGain = 0;
        if (plan.focus === "recovery") {
            recoverPlayerForDays(player, 2);
            developPlayer(player, team, rng, 0.2, "recovery", target);
        }
        else {
            developPlayer(player, team, rng, loadIntensity(plan.load), plan.focus, target);
            const targetPosition = positionFromTarget(target);
            if (targetPosition !== null) {
                positionGain = trainPosition(player, targetPosition, team, rng, false) * loadIntensity(plan.load) * 1.35;
            }
            player.health.fatigue = clamp(player.health.fatigue + loadFatigue(plan.load), 0, 100);
            if (plan.load === "heavy" && player.health.fatigue >= 68) {
                const injuryChance = clamp((player.health.fatigue - 62) * 0.00045, 0, 0.018);
                if (rng.bool(injuryChance)) {
                    player.health.injuredUntilDay = currentDay + rng.int(4, 18);
                    player.health.injuryRisk = "caution";
                }
            }
        }
        results.push({
            playerId: player.id,
            battingGain: sumBatting(player) - beforeBatting,
            pitchingGain: sumPitching(player) - beforePitching,
            positionGain,
            fatigueChange: player.health.fatigue - beforeFatigue,
        });
    });
    return results;
}
