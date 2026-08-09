import { pitchingOverall, preparedTeamStrength, } from "../../baseball-engine/src/index.js";
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function logisticWinProbability(teamStrength, opponentStrength) {
    return 1 / (1 + Math.exp((opponentStrength - teamStrength) / 7.5));
}
function stageForWins(wins) {
    return ["first-round", "quarterfinal", "semifinal", "runner-up", "champion"][wins];
}
function baseScore(stage) {
    return {
        "not-qualified": 0,
        "first-round": 40,
        quarterfinal: 65,
        semifinal: 90,
        "runner-up": 110,
        champion: 120,
    }[stage];
}
function outlookForScore(score, stage) {
    if (stage === "not-qualified")
        return "none";
    if (score >= 100)
        return "almost-certain";
    if (score >= 84)
        return "likely";
    if (score >= 70)
        return "bubble";
    return "difficult";
}
export function createRegionalEvaluation(team, autumn, selectedSchoolId, day, rng, gamePlan) {
    const prefecturalFinish = autumn.championSchoolId === selectedSchoolId
        ? "champion"
        : autumn.runnerUpSchoolId === selectedSchoolId
            ? "runner-up"
            : "none";
    if (prefecturalFinish === "none") {
        return {
            qualified: false,
            prefecturalFinish,
            stage: "not-qualified",
            wins: 0,
            lossMargin: null,
            score: 0,
            outlook: "none",
            strengths: [],
            concerns: ["秋季県大会で地区大会出場圏に届かなかった"],
            selected: false,
        };
    }
    const strength = preparedTeamStrength(team, day, "autumn", gamePlan);
    let wins = 0;
    let lossMargin = null;
    for (let round = 0; round < 4; round += 1) {
        const opponentStrength = clamp(rng.normal(63 + round * 1.6, 7.8), 42, 84);
        const winProbability = clamp(logisticWinProbability(strength, opponentStrength), 0.12, 0.88);
        if (rng.bool(winProbability)) {
            wins += 1;
        }
        else {
            lossMargin = clamp(Math.round(Math.abs(opponentStrength - strength) / 3 + rng.normal(1.8, 1.3)), 1, 10);
            break;
        }
    }
    const stage = stageForWins(wins);
    const bestPitcher = team.roster
        .filter((player) => player.active && player.grade <= 2 && player.isPitcherCandidate)
        .sort((left, right) => pitchingOverall(right) - pitchingOverall(left))[0];
    const pitcherBonus = bestPitcher ? clamp((pitchingOverall(bestPitcher) - 58) * 0.35, 0, 6) : 0;
    const prefectureBonus = prefecturalFinish === "champion" ? 12 : 7;
    const closeLossBonus = lossMargin === null ? 0 : lossMargin === 1 ? 8 : lossMargin <= 3 ? 4 : 0;
    const heavyLossPenalty = lossMargin !== null && lossMargin >= 6 ? 6 : 0;
    const score = Math.round(baseScore(stage) + prefectureBonus + closeLossBonus + pitcherBonus - heavyLossPenalty);
    const strengths = [];
    const concerns = [];
    strengths.push(prefecturalFinish === "champion" ? "秋季県大会優勝" : "秋季県大会準優勝");
    if (stage === "champion")
        strengths.push("地区大会優勝");
    else if (stage === "runner-up")
        strengths.push("地区大会準優勝");
    else if (stage === "semifinal")
        strengths.push("地区大会ベスト4");
    else if (stage === "quarterfinal")
        concerns.push("地区大会はベスト8敗退");
    else
        concerns.push("地区大会初戦敗退");
    if (lossMargin === 1)
        strengths.push("敗戦は1点差の惜敗");
    else if (lossMargin !== null && lossMargin <= 3)
        strengths.push("敗戦内容は接戦");
    if (pitcherBonus >= 4)
        strengths.push("評価の高い投手がいる");
    if (heavyLossPenalty > 0)
        concerns.push("最終戦の点差が大きい");
    return {
        qualified: true,
        prefecturalFinish,
        stage,
        wins,
        lossMargin,
        score,
        outlook: outlookForScore(score, stage),
        strengths,
        concerns,
        selected: null,
    };
}
export function resolveSenbatsuSelection(evaluation, rng) {
    if (!evaluation.qualified || evaluation.stage === "not-qualified" || evaluation.stage === "first-round") {
        return { ...evaluation, selected: false };
    }
    let probability;
    switch (evaluation.stage) {
        case "champion":
            probability = 1;
            break;
        case "runner-up":
            probability = 0.99;
            break;
        case "semifinal":
            probability = evaluation.score >= 96 ? 0.94 : 0.82;
            break;
        case "quarterfinal":
            probability = clamp(0.12 + (evaluation.score - 70) * 0.045, 0.08, 0.72);
            break;
        default: probability = 0;
    }
    return { ...evaluation, selected: rng.bool(probability) };
}
export function regionalStageLabel(stage) {
    return {
        "not-qualified": "地区大会不出場",
        "first-round": "地区大会初戦敗退",
        quarterfinal: "地区大会ベスト8",
        semifinal: "地区大会ベスト4",
        "runner-up": "地区大会準優勝",
        champion: "地区大会優勝",
    }[stage];
}
