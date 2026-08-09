import { prepareTeam } from "./lineup.js";
import { appropriatePitchCount, healthRiskForPitcher, outingFatigueIncrease, recentOfficialPitchCount, riskRank, } from "./workload.js";
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function playerById(team, playerId) {
    const player = team.roster.find((candidate) => candidate.id === playerId);
    if (!player)
        throw new Error(`Player not found: ${playerId}`);
    return player;
}
function createPitcherState(player) {
    return {
        player,
        pitches: 0,
        runsAllowed: 0,
        outsRecorded: 0,
        officialPitchLimitReached: false,
    };
}
function createTeamGameState(team, prepared) {
    const firstPitcherId = prepared.pitcherIds[0];
    if (!firstPitcherId)
        throw new Error(`${team.profile.name} has no available pitcher`);
    const pitcherState = createPitcherState(playerById(team, firstPitcherId));
    return {
        school: team,
        prepared,
        battingIndex: 0,
        runs: 0,
        hits: 0,
        fieldingErrors: 0,
        pitcherQueueIndex: 0,
        currentPitcher: pitcherState,
        pitcherStates: [pitcherState],
    };
}
function effectivePitching(player, inGamePitches) {
    const target = appropriatePitchCount(player);
    const fatigueRatio = inGamePitches / Math.max(45, target);
    const inGamePenalty = fatigueRatio <= 0.6
        ? 0
        : fatigueRatio <= 1
            ? (fatigueRatio - 0.6) * 8
            : 3.2 + (fatigueRatio - 1) * 22;
    const carriedPenalty = player.health.fatigue * 0.075;
    return {
        stuff: clamp(player.pitching.stuff - inGamePenalty - carriedPenalty, 10, 100),
        control: clamp(player.pitching.control - inGamePenalty * 1.16 - carriedPenalty * 1.1, 8, 100),
        breaking: clamp(player.pitching.breaking - inGamePenalty * 0.82 - carriedPenalty * 0.7, 8, 100),
    };
}
function outcomeProbabilities(batter, pitcherState, defenseRating) {
    const pitching = effectivePitching(pitcherState.player, pitcherState.pitches);
    const contactEdge = batter.batting.contact - (pitching.stuff * 0.48 + pitching.breaking * 0.52);
    const powerEdge = batter.batting.power - pitching.stuff;
    const speedEdge = batter.batting.speed - defenseRating;
    const defenseWeakness = 50 - defenseRating;
    const walk = clamp(0.078 + (50 - pitching.control) * 0.00125, 0.025, 0.19);
    const hbp = clamp(0.011 + (45 - pitching.control) * 0.00018, 0.004, 0.025);
    const strikeout = clamp(0.16 - contactEdge * 0.00165, 0.065, 0.32);
    const homeRun = clamp(0.012 + powerEdge * 0.00062, 0.002, 0.055);
    const triple = clamp(0.006 + speedEdge * 0.00016, 0.001, 0.022);
    const double = clamp(0.043 + powerEdge * 0.00038 + contactEdge * 0.00012, 0.015, 0.085);
    const single = clamp(0.175 + contactEdge * 0.00115 + speedEdge * 0.00022, 0.085, 0.285);
    const error = clamp(0.021 + defenseWeakness * 0.00045, 0.008, 0.055);
    const occupied = walk + hbp + strikeout + homeRun + triple + double + single + error;
    const out = Math.max(0.12, 1 - occupied);
    const total = occupied + out;
    return {
        OUT: out / total,
        STRIKEOUT: strikeout / total,
        WALK: walk / total,
        HBP: hbp / total,
        SINGLE: single / total,
        DOUBLE: double / total,
        TRIPLE: triple / total,
        HOMERUN: homeRun / total,
        ERROR: error / total,
    };
}
function drawOutcome(probabilities, rng) {
    const order = [
        "WALK", "HBP", "STRIKEOUT", "HOMERUN", "TRIPLE", "DOUBLE", "SINGLE", "ERROR", "OUT",
    ];
    let cursor = rng.next();
    for (const outcome of order) {
        cursor -= probabilities[outcome];
        if (cursor <= 0)
            return outcome;
    }
    return "OUT";
}
function pitchCountForOutcome(outcome, rng) {
    switch (outcome) {
        case "WALK": return rng.int(4, 8);
        case "HBP": return rng.int(1, 4);
        case "STRIKEOUT": return rng.int(3, 7);
        case "HOMERUN": return rng.int(1, 6);
        case "TRIPLE":
        case "DOUBLE":
        case "SINGLE": return rng.int(1, 7);
        case "ERROR": return rng.int(1, 6);
        default: return rng.int(1, 7);
    }
}
function scoreRunner(offense, defense) {
    offense.runs += 1;
    defense.currentPitcher.runsAllowed += 1;
}
function forceAdvance(bases, batter, offense, defense) {
    if (bases[0]) {
        if (bases[1]) {
            if (bases[2])
                scoreRunner(offense, defense);
            bases[2] = bases[1];
        }
        bases[1] = bases[0];
    }
    bases[0] = batter;
}
function advanceOnSingle(bases, batter, offense, defense, rng) {
    const first = bases[0];
    const second = bases[1];
    const third = bases[2];
    bases[0] = batter;
    bases[1] = null;
    bases[2] = null;
    if (third)
        scoreRunner(offense, defense);
    if (second) {
        const scoreChance = clamp(0.52 + second.speed * 0.004, 0.58, 0.93);
        if (rng.bool(scoreChance))
            scoreRunner(offense, defense);
        else
            bases[2] = second;
    }
    if (first) {
        const takeThirdChance = clamp(0.12 + first.speed * 0.004, 0.18, 0.58);
        if (rng.bool(takeThirdChance) && bases[2] === null)
            bases[2] = first;
        else
            bases[1] = first;
    }
}
function advanceOnDouble(bases, batter, offense, defense, rng) {
    const first = bases[0];
    const second = bases[1];
    const third = bases[2];
    bases[0] = null;
    bases[1] = batter;
    bases[2] = null;
    if (third)
        scoreRunner(offense, defense);
    if (second)
        scoreRunner(offense, defense);
    if (first) {
        const scoreChance = clamp(0.38 + first.speed * 0.0045, 0.45, 0.88);
        if (rng.bool(scoreChance))
            scoreRunner(offense, defense);
        else
            bases[2] = first;
    }
}
function advanceOnTripleOrHomeRun(bases, batter, homeRun, offense, defense) {
    bases.forEach((runner) => {
        if (runner)
            scoreRunner(offense, defense);
    });
    bases[0] = null;
    bases[1] = null;
    bases[2] = null;
    if (homeRun)
        scoreRunner(offense, defense);
    else
        bases[2] = batter;
}
function advanceOnError(bases, batter, offense, defense) {
    if (bases[2])
        scoreRunner(offense, defense);
    bases[2] = bases[1] ?? null;
    bases[1] = bases[0] ?? null;
    bases[0] = batter;
    defense.fieldingErrors += 1;
}
function applyOut(bases, batter, outs, offense, defense, rng) {
    if (outs <= 1 && bases[0]) {
        const doublePlayChance = clamp(0.105 + defense.prepared.defenseRating * 0.0012 - batter.batting.speed * 0.0009, 0.055, 0.22);
        if (rng.bool(doublePlayChance)) {
            bases[0] = null;
            defense.currentPitcher.outsRecorded += 2;
            return Math.min(3, outs + 2);
        }
    }
    if (outs <= 1 && bases[2]) {
        const sacrificeChance = clamp(0.08 + batter.batting.contact * 0.0012 + batter.batting.power * 0.0008, 0.1, 0.28);
        if (rng.bool(sacrificeChance)) {
            bases[2] = null;
            scoreRunner(offense, defense);
        }
    }
    defense.currentPitcher.outsRecorded += 1;
    return outs + 1;
}
function nextBatter(state) {
    const lineupLength = state.prepared.lineup.length;
    if (lineupLength === 0)
        throw new Error(`${state.school.profile.name} has an empty lineup`);
    const slot = state.prepared.lineup[state.battingIndex % lineupLength];
    if (!slot)
        throw new Error("Invalid batting index");
    state.battingIndex = (state.battingIndex + 1) % lineupLength;
    return playerById(state.school, slot.playerId);
}
function previousLineupRunner(state, offset) {
    const lineupLength = state.prepared.lineup.length;
    const index = (state.battingIndex - offset + lineupLength * 2) % lineupLength;
    const slot = state.prepared.lineup[index];
    if (!slot)
        throw new Error("Cannot create tie-break runner");
    const player = playerById(state.school, slot.playerId);
    return { playerId: player.id, speed: player.batting.speed };
}
function replacePitcher(defense) {
    defense.pitcherQueueIndex += 1;
    const nextId = defense.prepared.pitcherIds[defense.pitcherQueueIndex];
    if (nextId) {
        const state = createPitcherState(playerById(defense.school, nextId));
        defense.currentPitcher = state;
        defense.pitcherStates.push(state);
        return;
    }
    const alreadyUsed = new Set(defense.pitcherStates.map((state) => state.player.id));
    const emergency = defense.school.roster
        .filter((player) => player.active && !alreadyUsed.has(player.id))
        .sort((left, right) => right.pitching.stamina - left.pitching.stamina)[0];
    if (emergency) {
        const state = createPitcherState(emergency);
        defense.currentPitcher = state;
        defense.pitcherStates.push(state);
    }
}
function shouldReplacePitcherAtInningEnd(defense) {
    const pitcher = defense.currentPitcher;
    const target = appropriatePitchCount(pitcher.player);
    if (pitcher.officialPitchLimitReached)
        return true;
    if (pitcher.pitches >= target + 15)
        return true;
    if (pitcher.runsAllowed >= 6 && pitcher.pitches >= 55)
        return true;
    if (pitcher.player.health.fatigue >= 55 && pitcher.pitches >= 45)
        return true;
    return false;
}
function simulateHalfInning(offense, defense, inning, isBottom, home, away, day, rules, rng) {
    let outs = 0;
    let plateAppearances = 0;
    const bases = [null, null, null];
    if (inning >= rules.tieBreakStartInning) {
        bases[0] = previousLineupRunner(offense, 1);
        bases[1] = previousLineupRunner(offense, 2);
    }
    while (outs < 3) {
        if (defense.currentPitcher.officialPitchLimitReached)
            replacePitcher(defense);
        const batter = nextBatter(offense);
        const batterRunner = { playerId: batter.id, speed: batter.batting.speed };
        const probabilities = outcomeProbabilities(batter, defense.currentPitcher, defense.prepared.defenseRating);
        const outcome = drawOutcome(probabilities, rng);
        const pitches = pitchCountForOutcome(outcome, rng);
        defense.currentPitcher.pitches += pitches;
        plateAppearances += 1;
        switch (outcome) {
            case "WALK":
            case "HBP":
                forceAdvance(bases, batterRunner, offense, defense);
                break;
            case "SINGLE":
                offense.hits += 1;
                advanceOnSingle(bases, batterRunner, offense, defense, rng);
                break;
            case "DOUBLE":
                offense.hits += 1;
                advanceOnDouble(bases, batterRunner, offense, defense, rng);
                break;
            case "TRIPLE":
                offense.hits += 1;
                advanceOnTripleOrHomeRun(bases, batterRunner, false, offense, defense);
                break;
            case "HOMERUN":
                offense.hits += 1;
                advanceOnTripleOrHomeRun(bases, batterRunner, true, offense, defense);
                break;
            case "ERROR":
                advanceOnError(bases, batterRunner, offense, defense);
                break;
            case "STRIKEOUT":
                outs += 1;
                defense.currentPitcher.outsRecorded += 1;
                break;
            case "OUT":
                outs = applyOut(bases, batter, outs, offense, defense, rng);
                break;
        }
        const recentBeforeGame = recentOfficialPitchCount(defense.currentPitcher.player, day - 1, rules.pitchLimitWindowDays);
        if (recentBeforeGame + defense.currentPitcher.pitches >= rules.pitchLimit) {
            defense.currentPitcher.officialPitchLimitReached = true;
        }
        if (isBottom && inning >= rules.regulationInnings && home.runs > away.runs) {
            return { outs, plateAppearances, walkOff: true };
        }
    }
    if (shouldReplacePitcherAtInningEnd(defense))
        replacePitcher(defense);
    return { outs, plateAppearances, walkOff: false };
}
function coldRuleReached(inning, runDifference, rules) {
    return rules.prefecturalColdRules.some((rule) => inning >= rule.completedInning && runDifference >= rule.runDifference);
}
function finalizePitchers(state, day, rng) {
    let injuries = 0;
    const appearances = state.pitcherStates
        .filter((appearance) => appearance.pitches > 0)
        .map((appearance) => {
        const player = appearance.player;
        const priorLog = [...player.pitchingLog].reverse().find((entry) => entry.day < day);
        const restDays = priorLog ? Math.max(0, day - priorLog.day - 1) : 7;
        const risk = healthRiskForPitcher(player, appearance.pitches);
        player.health.fatigue = clamp(player.health.fatigue + outingFatigueIncrease(player, appearance.pitches, restDays), 0, 100);
        player.health.injuryRisk = risk;
        player.pitchingLog.push({ day, pitches: appearance.pitches, official: true });
        player.pitchingLog = player.pitchingLog.filter((entry) => entry.day >= day - 21);
        const injuryChance = { low: 0.001, caution: 0.005, high: 0.02, danger: 0.06 }[risk];
        if (rng.bool(injuryChance)) {
            const duration = risk === "danger" ? rng.int(21, 90) : risk === "high" ? rng.int(10, 45) : rng.int(3, 18);
            player.health.injuredUntilDay = day + duration;
            injuries += 1;
        }
        return {
            playerId: player.id,
            pitches: appearance.pitches,
            runsAllowed: appearance.runsAllowed,
            outsRecorded: appearance.outsRecorded,
            riskAtExit: risk,
            officialPitchLimitReached: appearance.officialPitchLimitReached,
        };
    });
    return { appearances, injuries };
}
function toSummary(state, appearances) {
    return {
        schoolId: state.school.profile.id,
        runs: state.runs,
        hits: state.hits,
        errors: state.fieldingErrors,
        pitcherAppearances: appearances,
    };
}
export function simulateGame(options, rng) {
    const home = createTeamGameState(options.home, prepareTeam(options.home, options.day, options.kind, options.homeGamePlan));
    const away = createTeamGameState(options.away, prepareTeam(options.away, options.day, options.kind, options.awayGamePlan));
    let inning = 1;
    let endedByColdRule = false;
    let walkOff = false;
    let totalPlateAppearances = 0;
    const allowColdGame = options.allowColdGame ?? true;
    while (inning <= 30) {
        const top = simulateHalfInning(away, home, inning, false, home, away, options.day, options.rules, rng);
        totalPlateAppearances += top.plateAppearances;
        if (inning >= options.rules.regulationInnings && home.runs > away.runs)
            break;
        const bottom = simulateHalfInning(home, away, inning, true, home, away, options.day, options.rules, rng);
        totalPlateAppearances += bottom.plateAppearances;
        if (bottom.walkOff) {
            walkOff = true;
            break;
        }
        const difference = Math.abs(home.runs - away.runs);
        if (allowColdGame && coldRuleReached(inning, difference, options.rules)) {
            endedByColdRule = true;
            break;
        }
        if (inning >= options.rules.regulationInnings && home.runs !== away.runs)
            break;
        inning += 1;
    }
    if (home.runs === away.runs) {
        if (rng.bool())
            home.runs += 1;
        else
            away.runs += 1;
    }
    const homePitching = finalizePitchers(home, options.day, rng);
    const awayPitching = finalizePitchers(away, options.day, rng);
    const homeWon = home.runs > away.runs;
    return {
        id: options.id,
        day: options.day,
        home: toSummary(home, homePitching.appearances),
        away: toSummary(away, awayPitching.appearances),
        winnerSchoolId: homeWon ? home.school.profile.id : away.school.profile.id,
        loserSchoolId: homeWon ? away.school.profile.id : home.school.profile.id,
        innings: inning,
        endedByColdRule,
        usedTieBreak: inning >= options.rules.tieBreakStartInning,
        walkOff,
        totalPlateAppearances,
        injuriesTriggered: homePitching.injuries + awayPitching.injuries,
    };
}
export function countRiskAppearances(game, minimumRisk) {
    const threshold = riskRank(minimumRisk);
    return [...game.home.pitcherAppearances, ...game.away.pitcherAppearances]
        .filter((appearance) => riskRank(appearance.riskAtExit) >= threshold)
        .length;
}
