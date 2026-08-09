import { battingOverall, pitchingOverall } from "./player-generation.js";
import { createRng } from "./rng.js";
import { createSimulationWorld, simulateSeason } from "./season.js";
function emptyAggregate(schoolId) {
    return {
        schoolId,
        games: 0,
        wins: 0,
        losses: 0,
        springTitles: 0,
        summerTitles: 0,
        autumnTitles: 0,
    };
}
function collectAbilitySnapshot(world) {
    const players = world.teams.flatMap((team) => team.roster);
    const pitchers = players.filter((player) => player.isPitcherCandidate);
    const battingValues = players.map(battingOverall);
    const pitchingValues = pitchers.map(pitchingOverall);
    return {
        playerCount: players.length,
        averageBatting: battingValues.length > 0
            ? battingValues.reduce((sum, value) => sum + value, 0) / battingValues.length
            : 0,
        averagePitchingForPitchers: pitchingValues.length > 0
            ? pitchingValues.reduce((sum, value) => sum + value, 0) / pitchingValues.length
            : 0,
        bestBatting: battingValues.length > 0 ? Math.max(...battingValues) : 0,
        bestPitching: pitchingValues.length > 0 ? Math.max(...pitchingValues) : 0,
    };
}
function combineSnapshots(snapshots) {
    const totalPlayers = snapshots.reduce((sum, snapshot) => sum + snapshot.playerCount, 0);
    if (snapshots.length === 0 || totalPlayers === 0) {
        return { playerCount: 0, averageBatting: 0, averagePitchingForPitchers: 0, bestBatting: 0, bestPitching: 0 };
    }
    return {
        playerCount: Math.round(totalPlayers / snapshots.length),
        averageBatting: snapshots.reduce((sum, snapshot) => sum + snapshot.averageBatting, 0) / snapshots.length,
        averagePitchingForPitchers: snapshots.reduce((sum, snapshot) => sum + snapshot.averagePitchingForPitchers, 0) / snapshots.length,
        bestBatting: Math.max(...snapshots.map((snapshot) => snapshot.bestBatting)),
        bestPitching: Math.max(...snapshots.map((snapshot) => snapshot.bestPitching)),
    };
}
function addGame(game, aggregateMap, totals) {
    totals.games += 1;
    totals.totalRuns += game.home.runs + game.away.runs;
    if (game.endedByColdRule)
        totals.coldGames += 1;
    if (game.usedTieBreak)
        totals.extraInningGames += 1;
    totals.injuries += game.injuriesTriggered;
    [...game.home.pitcherAppearances, ...game.away.pitcherAppearances].forEach((appearance) => {
        if (appearance.riskAtExit === "high" || appearance.riskAtExit === "danger") {
            totals.highRiskPitcherAppearances += 1;
        }
        if (appearance.riskAtExit === "danger")
            totals.dangerPitcherAppearances += 1;
        if (appearance.officialPitchLimitReached)
            totals.pitchLimitStops += 1;
    });
    const winner = aggregateMap.get(game.winnerSchoolId);
    const loser = aggregateMap.get(game.loserSchoolId);
    if (!winner || !loser)
        throw new Error("Missing aggregate record for a simulated school");
    winner.games += 1;
    winner.wins += 1;
    loser.games += 1;
    loser.losses += 1;
}
function addTournament(tournament, aggregateMap, totals) {
    tournament.games.forEach((record) => addGame(record.game, aggregateMap, totals));
    const champion = aggregateMap.get(tournament.championSchoolId);
    if (!champion)
        throw new Error("Missing champion aggregate");
    if (tournament.kind === "spring")
        champion.springTitles += 1;
    if (tournament.kind === "summer")
        champion.summerTitles += 1;
    if (tournament.kind === "autumn")
        champion.autumnTitles += 1;
    if (tournament.kind === "summer") {
        const seeded = new Set(tournament.seededSchoolIds);
        tournament.games.forEach(({ game }) => {
            [game.home.schoolId, game.away.schoolId].forEach((schoolId) => {
                if (seeded.has(schoolId))
                    totals.seededSummerGames += 1;
            });
            if (seeded.has(game.winnerSchoolId))
                totals.seededSummerWins += 1;
        });
    }
}
function addSeason(season, profiles, aggregateMap, totals) {
    addTournament(season.spring, aggregateMap, totals);
    addTournament(season.summer, aggregateMap, totals);
    addTournament(season.autumn, aggregateMap, totals);
    const championProfile = profiles.find((profile) => profile.id === season.summer.championSchoolId);
    if (!championProfile)
        throw new Error("Summer champion profile was not found");
    if (championProfile.ownership === "public")
        totals.publicSummerTitles += 1;
    else
        totals.privateSummerTitles += 1;
}
export function runBatchSimulation(profiles, rules, schedule, options, onProgress) {
    if (options.years < 1 || options.repetitions < 1) {
        throw new RangeError("years and repetitions must both be at least 1");
    }
    const aggregates = new Map(profiles.map((profile) => [profile.id, emptyAggregate(profile.id)]));
    const totals = {
        games: 0,
        totalRuns: 0,
        coldGames: 0,
        extraInningGames: 0,
        seededSummerGames: 0,
        seededSummerWins: 0,
        highRiskPitcherAppearances: 0,
        dangerPitcherAppearances: 0,
        pitchLimitStops: 0,
        injuries: 0,
        publicSummerTitles: 0,
        privateSummerTitles: 0,
    };
    const initialSnapshots = [];
    const finalSnapshots = [];
    const startYear = options.startYear ?? 2026;
    for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
        const runSeed = `${options.baseSeed}:run:${repetition + 1}`;
        const world = createSimulationWorld(profiles, runSeed, startYear);
        const rng = createRng(`${runSeed}:events`);
        initialSnapshots.push(collectAbilitySnapshot(world));
        for (let yearIndex = 0; yearIndex < options.years; yearIndex += 1) {
            const season = simulateSeason(world, rules, schedule, rng);
            addSeason(season, profiles, aggregates, totals);
        }
        finalSnapshots.push(collectAbilitySnapshot(world));
        onProgress?.(repetition + 1, options.repetitions);
    }
    return {
        baseSeed: options.baseSeed,
        yearsPerRun: options.years,
        repetitions: options.repetitions,
        seasons: options.years * options.repetitions,
        games: totals.games,
        totalRuns: totals.totalRuns,
        coldGames: totals.coldGames,
        extraInningGames: totals.extraInningGames,
        seededSummerGames: totals.seededSummerGames,
        seededSummerWins: totals.seededSummerWins,
        highRiskPitcherAppearances: totals.highRiskPitcherAppearances,
        dangerPitcherAppearances: totals.dangerPitcherAppearances,
        pitchLimitStops: totals.pitchLimitStops,
        injuries: totals.injuries,
        publicSummerTitles: totals.publicSummerTitles,
        privateSummerTitles: totals.privateSummerTitles,
        schoolAggregates: [...aggregates.values()].sort((left, right) => right.summerTitles - left.summerTitles || right.wins - left.wins),
        initialAbilitySnapshot: combineSnapshots(initialSnapshots),
        finalAbilitySnapshot: combineSnapshots(finalSnapshots),
    };
}
