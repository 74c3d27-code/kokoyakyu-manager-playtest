import { battingOverall, pitchingOverall } from "./player-generation.js";
import { isPitcherRuleEligible, recentOfficialPitchCount } from "./workload.js";
const FIELD_LINEUP_ORDER = ["C", "SS", "CF", "2B", "3B", "1B", "RF", "LF"];
const DEFAULT_GAME_PLAN = {
    preferredStarterId: null,
    pitcherUsage: "balanced",
};
export function availablePlayersForGame(team, day, kind) {
    return team.roster.filter((player) => player.active &&
        player.health.injuredUntilDay <= day &&
        (kind !== "autumn" || player.grade <= 2));
}
export function offensiveValue(player) {
    return player.batting.contact * 0.43 +
        player.batting.power * 0.34 +
        player.batting.speed * 0.15 +
        player.batting.fielding * 0.08;
}
export function defensiveValue(player, position) {
    const aptitude = player.positionAptitudes[position];
    const base = player.batting.fielding * 0.58 + player.batting.arm * 0.22 + player.batting.speed * 0.2;
    return base * (0.55 + aptitude * 0.0045);
}
function positionSelectionScore(player, position) {
    const defenseWeight = position === "C" || position === "SS"
        ? 0.66
        : position === "CF" || position === "2B"
            ? 0.55
            : 0.42;
    return defensiveValue(player, position) * defenseWeight + offensiveValue(player) * (1 - defenseWeight);
}
function chooseBestForPosition(players, used, position) {
    const candidates = players
        .filter((player) => !used.has(player.id) && player.primaryPosition !== "P")
        .sort((left, right) => positionSelectionScore(right, position) - positionSelectionScore(left, position));
    return candidates[0] ?? null;
}
function pitcherSelectionScore(player, day, gamePlan) {
    const recentPitches = recentOfficialPitchCount(player, day);
    const base = pitchingOverall(player);
    switch (gamePlan.pitcherUsage) {
        case "ace-first":
            return base - player.health.fatigue * 0.25 - recentPitches * 0.012;
        case "protect-health":
            return base - player.health.fatigue * 0.82 - recentPitches * 0.052;
        case "balanced":
            return base - player.health.fatigue * 0.48 - recentPitches * 0.025;
    }
}
function orderedPitchers(players, day, gamePlan) {
    const eligible = players
        .filter((player) => player.isPitcherCandidate && isPitcherRuleEligible(player, day));
    const ordered = eligible
        .sort((left, right) => pitcherSelectionScore(right, day, gamePlan) - pitcherSelectionScore(left, day, gamePlan));
    const preferred = gamePlan.preferredStarterId === null
        ? null
        : ordered.find((player) => player.id === gamePlan.preferredStarterId) ?? null;
    if (preferred !== null) {
        return [preferred.id, ...ordered.filter((player) => player.id !== preferred.id).map((player) => player.id)];
    }
    return ordered.map((player) => player.id);
}
export function prepareTeam(team, day, kind, plan = DEFAULT_GAME_PLAN) {
    const players = availablePlayersForGame(team, day, kind);
    const used = new Set();
    const lineup = [];
    FIELD_LINEUP_ORDER.forEach((position) => {
        const selected = chooseBestForPosition(players, used, position);
        if (selected) {
            used.add(selected.id);
            lineup.push({ playerId: selected.id, position });
        }
    });
    const dh = players
        .filter((player) => !used.has(player.id))
        .sort((left, right) => offensiveValue(right) - offensiveValue(left))[0];
    if (dh) {
        used.add(dh.id);
        lineup.push({ playerId: dh.id, position: "DH" });
    }
    while (lineup.length < 9) {
        const reserve = players
            .filter((player) => !used.has(player.id))
            .sort((left, right) => battingOverall(right) - battingOverall(left))[0];
        if (!reserve)
            break;
        used.add(reserve.id);
        lineup.push({ playerId: reserve.id, position: "DH" });
    }
    lineup.sort((left, right) => {
        const leftPlayer = players.find((player) => player.id === left.playerId);
        const rightPlayer = players.find((player) => player.id === right.playerId);
        return (rightPlayer ? offensiveValue(rightPlayer) : 0) - (leftPlayer ? offensiveValue(leftPlayer) : 0);
    });
    const pitcherIds = orderedPitchers(players, day, plan);
    if (pitcherIds.length === 0) {
        const emergency = [...players].sort((left, right) => right.pitching.stamina - left.pitching.stamina)[0];
        if (emergency)
            pitcherIds.push(emergency.id);
    }
    const defenseRatings = lineup
        .filter((slot) => slot.position !== "DH")
        .map((slot) => {
        const player = players.find((candidate) => candidate.id === slot.playerId);
        return player && slot.position !== "DH" ? defensiveValue(player, slot.position) : 35;
    });
    const offenseRatings = lineup.map((slot) => {
        const player = players.find((candidate) => candidate.id === slot.playerId);
        return player ? offensiveValue(player) : 30;
    });
    return {
        schoolId: team.profile.id,
        lineup,
        benchPlayerIds: players.filter((player) => !used.has(player.id)).map((player) => player.id),
        pitcherIds,
        defenseRating: defenseRatings.length > 0
            ? defenseRatings.reduce((sum, value) => sum + value, 0) / defenseRatings.length
            : 35,
        offenseRating: offenseRatings.length > 0
            ? offenseRatings.reduce((sum, value) => sum + value, 0) / offenseRatings.length
            : 35,
    };
}
export function preparedTeamStrength(team, day, kind, plan = DEFAULT_GAME_PLAN) {
    const prepared = prepareTeam(team, day, kind, plan);
    const firstPitcherId = prepared.pitcherIds[0];
    const firstPitcher = firstPitcherId
        ? team.roster.find((player) => player.id === firstPitcherId)
        : undefined;
    const pitching = firstPitcher ? pitchingOverall(firstPitcher) : 30;
    return prepared.offenseRating * 0.38 + prepared.defenseRating * 0.26 + pitching * 0.36;
}
