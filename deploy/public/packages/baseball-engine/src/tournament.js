import { recoverPlayerForDays } from "./workload.js";
import { simulateGame } from "./game.js";
function teamById(teams, schoolId) {
    const team = teams.find((candidate) => candidate.profile.id === schoolId);
    if (!team)
        throw new Error(`Unknown school: ${schoolId}`);
    return team;
}
function buildSeededBracket(schoolIds, seededSchoolIds, rng) {
    if (schoolIds.length !== 16)
        throw new Error("The starter tournament engine expects exactly 16 schools");
    if (seededSchoolIds.length === 0)
        return rng.shuffle(schoolIds);
    const bracket = Array(16).fill(null);
    const seedSlots = [0, 15, 7, 8];
    seededSchoolIds.slice(0, 4).forEach((schoolId, index) => {
        const slot = seedSlots[index];
        if (slot !== undefined)
            bracket[slot] = schoolId;
    });
    const unseeded = rng.shuffle(schoolIds.filter((schoolId) => !seededSchoolIds.includes(schoolId)));
    let cursor = 0;
    for (let index = 0; index < bracket.length; index += 1) {
        if (bracket[index] === null) {
            bracket[index] = unseeded[cursor] ?? null;
            cursor += 1;
        }
    }
    return bracket.map((schoolId) => {
        if (!schoolId)
            throw new Error("Failed to create a complete bracket");
        return schoolId;
    });
}
function recoverTeams(teams, days, currentDay) {
    teams.forEach((team) => {
        team.roster.forEach((player) => {
            recoverPlayerForDays(player, days);
            if (player.health.injuredUntilDay <= currentDay) {
                player.health.injuredUntilDay = -1;
                if (player.health.fatigue < 38)
                    player.health.injuryRisk = "low";
            }
        });
    });
}
export function simulateTournament(options, rng) {
    const seededSchoolIds = options.seededSchoolIds ?? [];
    const bracketSchoolIds = buildSeededBracket(options.teams.map((team) => team.profile.id), seededSchoolIds, rng);
    const roundDays = [options.startDay, options.startDay + 2, options.startDay + 4, options.startDay + 5];
    const records = [];
    let currentRoundIds = bracketSchoolIds;
    let semifinalistSchoolIds = [];
    let runnerUpSchoolId = "";
    let previousRoundDay = options.startDay;
    for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
        const round = (roundIndex + 1);
        const day = roundDays[roundIndex] ?? options.startDay;
        recoverTeams(options.teams, Math.max(0, day - previousRoundDay), day);
        previousRoundDay = day;
        if (round === 3)
            semifinalistSchoolIds = [...currentRoundIds];
        const winners = [];
        for (let gameIndex = 0; gameIndex < currentRoundIds.length; gameIndex += 2) {
            const firstId = currentRoundIds[gameIndex];
            const secondId = currentRoundIds[gameIndex + 1];
            if (!firstId || !secondId)
                throw new Error("Tournament bracket contained an incomplete pairing");
            const homeId = rng.bool() ? firstId : secondId;
            const awayId = homeId === firstId ? secondId : firstId;
            const game = simulateGame({
                id: `${options.kind}-${options.year}-r${round}-g${gameIndex / 2 + 1}`,
                day,
                kind: options.kind,
                home: teamById(options.teams, homeId),
                away: teamById(options.teams, awayId),
                rules: options.rules,
                allowColdGame: options.allowColdGame ?? true,
            }, rng);
            records.push({ round, game });
            winners.push(game.winnerSchoolId);
            if (round === 4)
                runnerUpSchoolId = game.loserSchoolId;
        }
        currentRoundIds = winners;
    }
    const championSchoolId = currentRoundIds[0];
    if (!championSchoolId || !runnerUpSchoolId)
        throw new Error("Tournament did not produce a champion and runner-up");
    return {
        kind: options.kind,
        year: options.year,
        championSchoolId,
        runnerUpSchoolId,
        semifinalistSchoolIds,
        seededSchoolIds: [...seededSchoolIds],
        bracketSchoolIds,
        games: records,
    };
}
export function assignSpringSeeds(teams, spring) {
    const semifinalists = spring.semifinalistSchoolIds;
    const finalLosers = spring.runnerUpSchoolId;
    const otherSemifinalists = semifinalists.filter((schoolId) => schoolId !== spring.championSchoolId && schoolId !== finalLosers);
    const ranked = [spring.championSchoolId, finalLosers, ...otherSemifinalists].slice(0, 4);
    teams.forEach((team) => {
        const index = ranked.indexOf(team.profile.id);
        team.springSeedRank = index >= 0 ? index + 1 : null;
    });
    return ranked;
}
