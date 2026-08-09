import { battingOverall, generatePlayer, pitchingOverall, } from "../../baseball-engine/src/index.js";
const AREAS = ["県北部", "県東部", "県中央", "県西部", "県南部", "県外"];
const PREFERENCES = [
    "local",
    "academic",
    "prestige",
    "playing-time",
    "easy-environment",
];
const STYLES = ["balanced", "power", "contact", "speed", "defense", "pitching"];
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function preferenceScore(preference, candidate, school, team) {
    switch (preference) {
        case "local":
            if (!candidate.localToPrefecture)
                return 18;
            return candidate.area === school.area ? 100 : 72;
        case "academic":
            return clamp(school.academicLevel * 1.18 - Math.max(0, candidate.academicLevel - school.academicLevel) * 1.8, 10, 100);
        case "prestige":
            return clamp(school.reputation * 1.02, 5, 100);
        case "playing-time": {
            const competition = team.roster.filter((player) => player.active && player.primaryPosition === candidate.player.primaryPosition).length;
            return clamp(100 - competition * 13 - Math.max(0, team.roster.length - school.rosterTarget) * 2, 8, 100);
        }
        case "easy-environment":
            return clamp(128 - school.coaching * 0.52 - school.reputation * 0.38, 8, 100);
    }
}
function candidateEligibility(candidate, school) {
    const concerns = [];
    if (school.ownership === "public" && !candidate.localToPrefecture) {
        concerns.push("公立校のため県外からの進学対象外");
    }
    const tolerance = school.ownership === "public" ? 9 : 18;
    if (candidate.academicLevel < school.academicLevel - tolerance) {
        concerns.push("現時点の学力が入試目安に届いていない");
    }
    return { eligible: concerns.length === 0, concerns };
}
function outlookForScore(eligible, score) {
    if (!eligible)
        return "ineligible";
    if (score >= 86)
        return "very-high";
    if (score >= 76)
        return "high";
    if (score >= 64)
        return "medium";
    return "low";
}
function currentEstimate(player) {
    const batting = battingOverall(player);
    const pitching = player.isPitcherCandidate ? pitchingOverall(player) : 0;
    const score = Math.max(batting, pitching);
    if (score >= 70)
        return "県上位級";
    if (score >= 61)
        return "有望";
    if (score >= 52)
        return "標準以上";
    return "素材型";
}
function potentialEstimate(player) {
    const battingCap = Object.values(player.battingPotential)
        .reduce((sum, potential) => sum + potential.hardCap, 0) / 5;
    const pitchingCap = Object.values(player.pitchingPotential)
        .reduce((sum, potential) => sum + potential.hardCap, 0) / 4;
    const score = player.isPitcherCandidate ? Math.max(battingCap, pitchingCap) : battingCap;
    if (score >= 76)
        return "大きな伸びしろ";
    if (score >= 68)
        return "伸びしろあり";
    if (score >= 60)
        return "標準的";
    return "完成度重視";
}
function sourceProfile(index, year, rng) {
    const quality = rng.int(38, 92);
    return {
        id: `junior-pool-${year}-${index}`,
        name: "中学候補選手プール",
        shortName: "候補",
        ownership: "public",
        archetype: "public-mid",
        area: "県中央",
        academicLevel: 55,
        reputation: quality,
        facilities: rng.int(45, 78),
        coaching: rng.int(45, 82),
        recruiting: quality,
        rosterTarget: 30,
        style: rng.pick(STYLES),
        recruitmentPreferences: {
            localBias: 60,
            academicWeight: 60,
            prestigeWeight: 60,
            playingTimeWeight: 60,
            easyEnvironmentWeight: 60,
        },
        description: "候補選手生成用の内部プロフィール",
    };
}
export function generateRecruitCandidates(school, team, year, rng, count = 12) {
    return Array.from({ length: count }, (_, index) => {
        const area = rng.pick(AREAS);
        const localToPrefecture = area !== "県外";
        const academicLevel = rng.int(38, 82);
        const primaryPreference = rng.pick(PREFERENCES);
        let secondaryPreference = rng.pick(PREFERENCES);
        while (secondaryPreference === primaryPreference)
            secondaryPreference = rng.pick(PREFERENCES);
        const player = generatePlayer(sourceProfile(index, year, rng), 1, index, year + 1, rng);
        player.id = `recruit-${year + 1}-${index + 1}-${player.id}`;
        const candidateBase = {
            area,
            localToPrefecture,
            academicLevel,
            player,
        };
        const eligibility = candidateEligibility(candidateBase, school);
        const primary = preferenceScore(primaryPreference, candidateBase, school, team);
        const secondary = preferenceScore(secondaryPreference, candidateBase, school, team);
        const generalAttraction = clamp(school.reputation * 0.38 + school.coaching * 0.22 + school.facilities * 0.2 + school.recruiting * 0.2, 0, 100);
        const score = clamp(primary * 0.58 + secondary * 0.25 + generalAttraction * 0.17, 0, 100);
        const positives = [];
        const concerns = [...eligibility.concerns];
        if (area === school.area)
            positives.push("学校と同じ地域の選手");
        if (primary >= 82)
            positives.push("第一希望と学校の特徴が合う");
        if (secondary >= 78)
            positives.push("第二希望とも相性が良い");
        if (primaryPreference === "playing-time" && primary < 55)
            concerns.push("同じポジションの競争が激しい");
        if (primaryPreference === "prestige" && school.reputation < 68)
            concerns.push("より評判の高い学校を希望している");
        if (primaryPreference === "easy-environment" && school.coaching > 78)
            concerns.push("練習環境の厳しさを気にしている");
        if (positives.length === 0 && eligibility.eligible)
            positives.push("進学条件は満たしている");
        return {
            id: `candidate-${year + 1}-${index + 1}`,
            player,
            area,
            localToPrefecture,
            academicLevel,
            primaryPreference,
            secondaryPreference,
            estimateLabel: currentEstimate(player),
            potentialLabel: potentialEstimate(player),
            eligible: eligibility.eligible,
            matchScore: score,
            outlook: outlookForScore(eligibility.eligible, score),
            positives,
            concerns,
        };
    });
}
export function candidateAcceptanceProbability(candidate) {
    if (!candidate.eligible)
        return 0;
    return clamp(0.08 + (candidate.matchScore - 48) * 0.018, 0.08, 0.9);
}
export function preferenceLabel(preference) {
    return {
        local: "地元・通学重視",
        academic: "学力・進学重視",
        prestige: "評判・強豪志向",
        "playing-time": "出場機会重視",
        "easy-environment": "無理の少ない環境",
    }[preference];
}
