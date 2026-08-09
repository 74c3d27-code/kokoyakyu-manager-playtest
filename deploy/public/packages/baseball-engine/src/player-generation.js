import { generateJapaneseName } from "./names.js";
const BATTING_KEYS = ["contact", "power", "speed", "fielding", "arm"];
const PITCHING_KEYS = ["stuff", "control", "breaking", "stamina"];
const FIELD_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const BATTER_ARCHETYPE_WEIGHTS = {
    contact: { contact: 1.75, power: 0.78, speed: 1.0, fielding: 1.0, arm: 0.82 },
    power: { contact: 0.86, power: 1.85, speed: 0.72, fielding: 0.84, arm: 0.98 },
    speed: { contact: 1.05, power: 0.7, speed: 1.9, fielding: 1.25, arm: 0.8 },
    defense: { contact: 0.9, power: 0.68, speed: 1.15, fielding: 1.8, arm: 1.25 },
    arm: { contact: 0.86, power: 1.02, speed: 0.86, fielding: 1.16, arm: 1.9 },
    balanced: { contact: 1, power: 1, speed: 1, fielding: 1, arm: 1 },
};
const PITCHER_ARCHETYPE_WEIGHTS = {
    power: { stuff: 1.9, control: 0.72, breaking: 0.95, stamina: 1.05 },
    control: { stuff: 0.82, control: 1.9, breaking: 1.15, stamina: 1.0 },
    breaking: { stuff: 0.95, control: 1.02, breaking: 1.9, stamina: 0.9 },
    stamina: { stuff: 1.05, control: 0.9, breaking: 0.9, stamina: 1.9 },
    balanced: { stuff: 1, control: 1, breaking: 1, stamina: 1 },
};
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function schoolTalentQuality(profile) {
    return clamp((profile.reputation * 0.38 + profile.recruiting * 0.28 + profile.facilities * 0.14 + profile.coaching * 0.2) / 100, 0, 1);
}
function selectBattingBudget(rng, quality) {
    const tierIndex = rng.weightedIndex([
        0.9 - 0.2 * quality,
        0.09 + 0.15 * quality,
        0.009 + 0.04 * quality,
        0.001 + 0.01 * quality,
    ]);
    const ranges = [
        [240, 285],
        [286, 315],
        [316, 345],
        [346, 375],
    ];
    const range = ranges[tierIndex] ?? [240, 285];
    return rng.int(range[0], range[1]);
}
function selectPitchingBudget(rng, quality) {
    const tierIndex = rng.weightedIndex([
        0.89 - 0.18 * quality,
        0.095 + 0.13 * quality,
        0.014 + 0.04 * quality,
        0.001 + 0.01 * quality,
    ]);
    const ranges = [
        [190, 225],
        [226, 250],
        [251, 280],
        [281, 315],
    ];
    const range = ranges[tierIndex] ?? [190, 225];
    return rng.int(range[0], range[1]);
}
function createCapAllocation(keys, budget, minimum, maximum, weights, rng) {
    const rawWeights = keys.map((key) => weights[key] * rng.normal(1, 0.12));
    const positiveWeights = rawWeights.map((value) => Math.max(0.15, value));
    const totalWeight = positiveWeights.reduce((sum, value) => sum + value, 0);
    const baseTotal = minimum * keys.length;
    const distributable = Math.max(0, budget - baseTotal);
    const allocation = {};
    keys.forEach((key, index) => {
        const share = positiveWeights[index] ?? 1;
        allocation[key] = clamp(Math.round(minimum + distributable * (share / totalWeight)), minimum, maximum);
    });
    return allocation;
}
function currentFromCap(cap, grade, rng, schoolDevelopment) {
    const gapByGrade = {
        1: [9, 21],
        2: [5, 15],
        3: [2, 11],
    };
    const [minGap, maxGap] = gapByGrade[grade];
    const gap = rng.int(minGap, maxGap) - schoolDevelopment * (grade - 1) * 1.5;
    return clamp(cap - gap + rng.normal(0, 1.5), 10, cap);
}
function createPotential(keys, caps, favoredWeights, rng) {
    const result = {};
    keys.forEach((key) => {
        const hardCap = caps[key];
        result[key] = {
            softCap: clamp(hardCap - rng.int(0, 6), 10, hardCap),
            hardCap,
            aptitude: clamp(rng.normal(0.98 + (favoredWeights[key] - 1) * 0.12, 0.12), 0.68, 1.32),
        };
    });
    return result;
}
function relatedPositionBonus(primary, target) {
    if (primary === target)
        return 86;
    const groups = [
        ["2B", "SS", "3B"],
        ["LF", "CF", "RF"],
        ["1B", "3B"],
        ["P", "1B", "RF"],
    ];
    if (groups.some((group) => group.includes(primary) && group.includes(target)))
        return 46;
    if (target === "1B" || target === "LF" || target === "RF")
        return 34;
    if (target === "SS")
        return 18;
    if (target === "C")
        return 12;
    if (target === "P")
        return 10;
    return 25;
}
function createPositionAptitudes(primary, rng) {
    const result = {};
    FIELD_POSITIONS.forEach((position) => {
        const base = relatedPositionBonus(primary, position);
        result[position] = clamp(Math.round(rng.normal(base, primary === position ? 5 : 9)), 0, 100);
    });
    result[primary] = clamp(Math.max(result[primary], rng.int(76, 94)), 0, 100);
    return result;
}
function styleArchetypeWeights(style) {
    switch (style) {
        case "power": return ["power", "power", "balanced", "arm", "contact"];
        case "contact": return ["contact", "contact", "balanced", "speed", "defense"];
        case "speed": return ["speed", "speed", "contact", "defense", "balanced"];
        case "defense": return ["defense", "defense", "speed", "arm", "balanced"];
        case "pitching": return ["defense", "arm", "balanced", "contact", "speed"];
        default: return ["balanced", "contact", "power", "speed", "defense", "arm"];
    }
}
function choosePrimaryPosition(rng, forcedPosition) {
    if (forcedPosition)
        return forcedPosition;
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const weights = [0.18, 0.09, 0.1, 0.11, 0.11, 0.11, 0.1, 0.1, 0.1];
    return positions[rng.weightedIndex(weights)] ?? "RF";
}
export function generatePlayer(profile, grade, sequence, seasonYear, rng, forcedPosition) {
    const quality = schoolTalentQuality(profile);
    const primaryPosition = choosePrimaryPosition(rng, forcedPosition);
    const isPitcherCandidate = primaryPosition === "P" || rng.bool(0.055);
    const isTwoWayCandidate = isPitcherCandidate && rng.bool(0.008 + quality * 0.008);
    const batterArchetype = rng.pick(styleArchetypeWeights(profile.style));
    const pitcherArchetype = rng.pick(["power", "control", "breaking", "stamina", "balanced"]);
    const battingWeights = BATTER_ARCHETYPE_WEIGHTS[batterArchetype];
    const pitchingWeights = PITCHER_ARCHETYPE_WEIGHTS[pitcherArchetype];
    let battingBudget = selectBattingBudget(rng, quality);
    if (isPitcherCandidate && !isTwoWayCandidate)
        battingBudget -= rng.int(15, 38);
    const battingCaps = createCapAllocation(BATTING_KEYS, battingBudget, 30, 95, battingWeights, rng);
    const battingPotential = createPotential(BATTING_KEYS, battingCaps, battingWeights, rng);
    const schoolDevelopment = (profile.coaching + profile.facilities) / 200;
    const batting = {};
    BATTING_KEYS.forEach((key) => {
        batting[key] = currentFromCap(battingCaps[key], grade, rng, schoolDevelopment);
    });
    let pitchingCaps;
    if (isPitcherCandidate) {
        pitchingCaps = createCapAllocation(PITCHING_KEYS, selectPitchingBudget(rng, quality), 30, 95, pitchingWeights, rng);
    }
    else {
        pitchingCaps = {
            stuff: rng.int(15, 36),
            control: rng.int(15, 38),
            breaking: rng.int(10, 32),
            stamina: rng.int(20, 45),
        };
    }
    const pitchingPotential = createPotential(PITCHING_KEYS, pitchingCaps, pitchingWeights, rng);
    const pitching = {};
    PITCHING_KEYS.forEach((key) => {
        pitching[key] = isPitcherCandidate
            ? currentFromCap(pitchingCaps[key], grade, rng, schoolDevelopment)
            : clamp(pitchingCaps[key] - rng.int(0, 5), 8, pitchingCaps[key]);
    });
    const name = generateJapaneseName(rng);
    return {
        id: `${profile.id}-${seasonYear}-${grade}-${sequence}`,
        firstName: name.firstName,
        lastName: name.lastName,
        grade,
        throws: rng.bool(0.16) ? "L" : "R",
        bats: rng.bool(0.1) ? "S" : rng.bool(0.38) ? "L" : "R",
        primaryPosition,
        batting,
        pitching,
        battingPotential,
        pitchingPotential,
        positionAptitudes: createPositionAptitudes(primaryPosition, rng),
        health: {
            fatigue: 0,
            injuryRisk: "low",
            injuredUntilDay: -1,
        },
        pitchingLog: [],
        isPitcherCandidate,
        isTwoWayCandidate,
        active: true,
    };
}
function forcedPositionsForClass(classSize) {
    const minimums = ["P", "P", "C", "SS"];
    const result = [];
    for (let index = 0; index < classSize; index += 1) {
        result.push(minimums[index]);
    }
    return result;
}
export function generateIncomingClass(profile, count, seasonYear, rng, startingSequence = 0) {
    const forced = forcedPositionsForClass(count);
    return Array.from({ length: count }, (_, index) => generatePlayer(profile, 1, startingSequence + index, seasonYear, rng, forced[index]));
}
export function generateInitialTeam(profile, seasonYear, rng) {
    const roster = [];
    const target = profile.rosterTarget;
    const basePerGrade = Math.floor(target / 3);
    const remainder = target - basePerGrade * 3;
    let sequence = 0;
    [1, 2, 3].forEach((grade, gradeIndex) => {
        const count = basePerGrade + (gradeIndex < remainder ? 1 : 0);
        const forced = forcedPositionsForClass(count);
        for (let index = 0; index < count; index += 1) {
            roster.push(generatePlayer(profile, grade, sequence, seasonYear, rng, forced[index]));
            sequence += 1;
        }
    });
    return {
        profile,
        roster,
        springSeedRank: null,
    };
}
export function battingOverall(player) {
    const { contact, power, speed, fielding, arm } = player.batting;
    return contact * 0.29 + power * 0.23 + speed * 0.13 + fielding * 0.23 + arm * 0.12;
}
export function pitchingOverall(player) {
    const { stuff, control, breaking, stamina } = player.pitching;
    return stuff * 0.31 + control * 0.27 + breaking * 0.25 + stamina * 0.17;
}
