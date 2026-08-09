import { assignSpringSeeds, createRng, createSimulationWorld, developTeamForWeek, developTeamWithPlan, generateIncomingClass, recoverPlayerForDays, simulateGame, } from "../../baseball-engine/src/index.js";
import { candidateAcceptanceProbability, generateRecruitCandidates } from "./recruiting.js";
import { createRegionalEvaluation, resolveSenbatsuSelection } from "./selection.js";
import { DEFAULT_GAME_PLAN, DEFAULT_TRAINING_PLAN, } from "./types.js";
const TOURNAMENT_WEEKS = {
    spring: [2, 3, 4, 5],
    summer: [14, 15, 16, 17],
    autumn: [22, 23, 24, 25],
};
const ROUND_LABELS = ["1回戦", "準々決勝", "準決勝", "決勝"];
function cloneTrainingPlan() {
    return { ...DEFAULT_TRAINING_PLAN, assignments: [] };
}
function cloneGamePlan() {
    return { ...DEFAULT_GAME_PLAN };
}
function emptyCurrentSeason() {
    return {
        spring: null,
        summer: null,
        autumn: null,
        regionalEvaluation: null,
        recruitmentResolution: null,
    };
}
function selectedTeam(state) {
    const team = state.world.teams.find((candidate) => candidate.profile.id === state.selectedSchoolId);
    if (!team)
        throw new Error(`Selected school was not found: ${state.selectedSchoolId}`);
    return team;
}
function teamById(teams, schoolId) {
    const team = teams.find((candidate) => candidate.profile.id === schoolId);
    if (!team)
        throw new Error(`Unknown school: ${schoolId}`);
    return team;
}
function event(state, category, title, detail, important = false) {
    return {
        id: `${state.campaignYear}-${state.week}-${category}-${state.events.length + 1}`,
        year: state.startYear + state.campaignYear - 1,
        campaignYear: state.campaignYear,
        week: state.week,
        category,
        title,
        detail,
        important,
    };
}
function appendEvents(state, events) {
    state.events = [...events, ...state.events].slice(0, 260);
}
function advanceWorldToDay(state, targetDay) {
    const days = Math.max(0, targetDay - state.world.day);
    if (days > 0) {
        state.world.teams.forEach((team) => {
            team.roster.forEach((player) => {
                recoverPlayerForDays(player, days);
                if (player.health.injuredUntilDay <= targetDay) {
                    player.health.injuredUntilDay = -1;
                    if (player.health.fatigue < 38)
                        player.health.injuryRisk = "low";
                }
            });
        });
    }
    state.world.day = Math.max(state.world.day, targetDay);
}
function tournamentKindForWeek(week) {
    const entry = Object.entries(TOURNAMENT_WEEKS)
        .find(([, weeks]) => weeks.includes(week));
    return entry?.[0] ?? null;
}
function roundDaysFor(kind, startDay) {
    if (kind === "summer")
        return [startDay, startDay + 3, startDay + 7, startDay + 9];
    return [startDay, startDay + 7, startDay + 14, startDay + 21];
}
function buildSeededBracket(schoolIds, seededSchoolIds, rng) {
    if (schoolIds.length !== 16)
        throw new Error("The manager playtest expects exactly 16 schools");
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
            throw new Error("Failed to create a complete tournament bracket");
        return schoolId;
    });
}
function startTournament(state, kind, rng) {
    const weeks = TOURNAMENT_WEEKS[kind];
    const firstWeek = weeks[0] ?? state.week;
    const startDay = (firstWeek - 1) * 7;
    const seededSchoolIds = kind === "summer"
        ? state.world.teams
            .filter((team) => team.springSeedRank !== null)
            .sort((left, right) => (left.springSeedRank ?? 99) - (right.springSeedRank ?? 99))
            .map((team) => team.profile.id)
        : [];
    const bracketSchoolIds = buildSeededBracket(state.world.teams.map((team) => team.profile.id), seededSchoolIds, rng);
    return {
        kind,
        year: state.startYear + state.campaignYear - 1,
        startDay,
        roundDays: roundDaysFor(kind, startDay),
        nextRound: 1,
        seededSchoolIds,
        bracketSchoolIds,
        currentRoundSchoolIds: [...bracketSchoolIds],
        semifinalistSchoolIds: [],
        runnerUpSchoolId: null,
        championSchoolId: null,
        games: [],
    };
}
function planForSchool(state, schoolId) {
    return schoolId === state.selectedSchoolId ? state.gamePlan : undefined;
}
function simulateTournamentRound(state, rules, rng) {
    const tournament = state.activeTournament;
    if (!tournament)
        throw new Error("No active tournament");
    if (tournament.nextRound === 5)
        throw new Error("Tournament is already complete");
    const round = tournament.nextRound;
    const day = tournament.roundDays[round - 1] ?? tournament.startDay;
    advanceWorldToDay(state, day);
    if (round === 3)
        tournament.semifinalistSchoolIds = [...tournament.currentRoundSchoolIds];
    const winners = [];
    const events = [];
    let userGame = null;
    for (let gameIndex = 0; gameIndex < tournament.currentRoundSchoolIds.length; gameIndex += 2) {
        const firstId = tournament.currentRoundSchoolIds[gameIndex];
        const secondId = tournament.currentRoundSchoolIds[gameIndex + 1];
        if (!firstId || !secondId)
            throw new Error("Tournament round contained an incomplete pairing");
        const homeId = rng.bool() ? firstId : secondId;
        const awayId = homeId === firstId ? secondId : firstId;
        const homeGamePlan = planForSchool(state, homeId);
        const awayGamePlan = planForSchool(state, awayId);
        const game = simulateGame({
            id: `manager-${tournament.kind}-${tournament.year}-r${round}-g${gameIndex / 2 + 1}`,
            day,
            kind: tournament.kind,
            home: teamById(state.world.teams, homeId),
            away: teamById(state.world.teams, awayId),
            rules,
            allowColdGame: true,
            ...(homeGamePlan ? { homeGamePlan } : {}),
            ...(awayGamePlan ? { awayGamePlan } : {}),
        }, rng);
        tournament.games.push({ round, game });
        winners.push(game.winnerSchoolId);
        if (homeId === state.selectedSchoolId || awayId === state.selectedSchoolId) {
            userGame = game;
            const won = game.winnerSchoolId === state.selectedSchoolId;
            const own = game.home.schoolId === state.selectedSchoolId ? game.home : game.away;
            const opponent = game.home.schoolId === state.selectedSchoolId ? game.away : game.home;
            const opponentName = teamById(state.world.teams, opponent.schoolId).profile.shortName;
            events.push(event(state, "game", `${tournament.kind === "spring" ? "春" : tournament.kind === "summer" ? "夏" : "秋"} ${ROUND_LABELS[round - 1]} ${won ? "勝利" : "敗退"}`, `${opponentName}に${own.runs}-${opponent.runs}。${game.endedByColdRule ? "コールドゲーム。" : game.usedTieBreak ? "延長タイブレーク。" : ""}`, true));
        }
        if (round === 4)
            tournament.runnerUpSchoolId = game.loserSchoolId;
    }
    tournament.currentRoundSchoolIds = winners;
    tournament.nextRound = (round + 1);
    if (tournament.nextRound !== 5)
        return { game: userGame, completedResult: null, events };
    const championSchoolId = winners[0];
    if (!championSchoolId || !tournament.runnerUpSchoolId)
        throw new Error("Tournament did not produce a champion");
    tournament.championSchoolId = championSchoolId;
    const result = {
        kind: tournament.kind,
        year: tournament.year,
        championSchoolId,
        runnerUpSchoolId: tournament.runnerUpSchoolId,
        semifinalistSchoolIds: [...tournament.semifinalistSchoolIds],
        seededSchoolIds: [...tournament.seededSchoolIds],
        bracketSchoolIds: [...tournament.bracketSchoolIds],
        games: [...tournament.games],
    };
    return { game: userGame, completedResult: result, events };
}
function userTournamentSummary(result, schoolId) {
    const games = result.games.filter(({ game }) => game.home.schoolId === schoolId || game.away.schoolId === schoolId);
    const wins = games.filter(({ game }) => game.winnerSchoolId === schoolId).length;
    const losses = games.length - wins;
    let finish = "1回戦敗退";
    if (result.championSchoolId === schoolId)
        finish = "優勝";
    else if (result.runnerUpSchoolId === schoolId)
        finish = "準優勝";
    else {
        const loss = games.find(({ game }) => game.loserSchoolId === schoolId);
        if (loss?.round === 3)
            finish = "ベスト4";
        else if (loss?.round === 2)
            finish = "ベスト8";
    }
    return { kind: result.kind, finish, games: games.length, wins, losses };
}
function finalizeTournament(state, result) {
    const events = [];
    state.currentSeason[result.kind] = result;
    if (result.kind === "spring")
        assignSpringSeeds(state.world.teams, result);
    if (result.kind === "summer") {
        state.world.teams.forEach((team) => {
            team.roster.forEach((player) => {
                if (player.grade === 3)
                    player.active = false;
            });
        });
    }
    const championName = teamById(state.world.teams, result.championSchoolId).profile.shortName;
    events.push(event(state, "tournament", `${result.kind === "spring" ? "春季" : result.kind === "summer" ? "夏季" : "秋季"}県大会終了`, `優勝は${championName}。${result.kind === "spring" ? "ベスト4が夏のシードを獲得しました。" : ""}`, result.championSchoolId === state.selectedSchoolId));
    if (result.kind === "summer" && result.championSchoolId === state.selectedSchoolId) {
        events.push(event(state, "tournament", "全国大会出場決定", "県代表として全国大会へ進みます。全国大会の詳細試合は次段階で追加します。", true));
    }
    return events;
}
function summarizeTopDevelopment(state, deltas) {
    const team = selectedTeam(state);
    const best = [...deltas]
        .filter((delta) => delta.battingGain + delta.pitchingGain + delta.positionGain > 0.04)
        .sort((left, right) => right.battingGain + right.pitchingGain + right.positionGain -
        (left.battingGain + left.pitchingGain + left.positionGain))[0];
    if (!best)
        return null;
    const player = team.roster.find((candidate) => candidate.id === best.playerId);
    if (!player)
        return null;
    return event(state, "training", "今週の成長", `${player.lastName}${player.firstName}が最も成長しました。能力合計の伸び ${(best.battingGain + best.pitchingGain + best.positionGain).toFixed(2)}。`);
}
function trainNormalWeek(state, rng) {
    const targetDay = state.week * 7 - 1;
    advanceWorldToDay(state, targetDay);
    const user = selectedTeam(state);
    const deltas = developTeamWithPlan(user, rng, state.trainingPlan, state.world.day);
    state.world.teams.forEach((team) => {
        if (team.profile.id !== state.selectedSchoolId)
            developTeamForWeek(team, rng, 1);
    });
    const events = [];
    const top = summarizeTopDevelopment(state, deltas);
    if (top)
        events.push(top);
    const newInjuries = user.roster.filter((player) => player.health.injuredUntilDay > state.world.day && player.health.injuredUntilDay <= state.world.day + 18);
    if (newInjuries.length > 0) {
        const names = newInjuries.slice(0, 3).map((player) => `${player.lastName}${player.firstName}`).join("、");
        events.push(event(state, "health", "故障・違和感", `${names}は練習負荷の影響で離脱しています。`, true));
    }
    return { deltas, events };
}
function defaultRegionalEvaluation() {
    return {
        qualified: false,
        prefecturalFinish: "none",
        stage: "not-qualified",
        wins: 0,
        lossMargin: null,
        score: 0,
        outlook: "none",
        strengths: [],
        concerns: ["地区大会出場条件を満たしていない"],
        selected: false,
    };
}
function runRegionalEvaluation(state, rng) {
    const autumn = state.currentSeason.autumn;
    if (!autumn || state.currentSeason.regionalEvaluation !== null)
        return [];
    const evaluation = createRegionalEvaluation(selectedTeam(state), autumn, state.selectedSchoolId, state.world.day, rng, state.gamePlan);
    state.currentSeason.regionalEvaluation = evaluation;
    const detail = evaluation.qualified
        ? `地区大会は${evaluation.wins}勝。選抜見込みは${evaluation.outlook}です。`
        : "秋季県大会で地区大会出場圏に届きませんでした。";
    return [event(state, "selection", "秋季地区大会評価", detail, evaluation.qualified)];
}
function generateScoutingPool(state, rng) {
    if (state.recruitCandidates.length > 0)
        return [];
    const team = selectedTeam(state);
    state.recruitCandidates = generateRecruitCandidates(team.profile, team, state.startYear + state.campaignYear - 1, rng, 12);
    return [event(state, "recruiting", "中学生候補を更新", "12人の候補を確認できます。関心を示せるのは最大3人です。", true)];
}
function resolveSelectionAnnouncement(state, rng) {
    const evaluation = state.currentSeason.regionalEvaluation;
    if (!evaluation || evaluation.selected !== null)
        return [];
    const resolved = resolveSenbatsuSelection(evaluation, rng);
    state.currentSeason.regionalEvaluation = resolved;
    return [event(state, "selection", resolved.selected ? "選抜大会出場決定" : "選抜大会は落選", resolved.selected
            ? "秋の成績と試合内容が評価され、選抜大会への出場が決まりました。"
            : "秋の成績と試合内容を総合した結果、今回は選出されませんでした。", true)];
}
function resetPromotedPlayer(player) {
    player.active = true;
    player.health.fatigue = 0;
    player.health.injuryRisk = "low";
    player.health.injuredUntilDay = -1;
    player.pitchingLog = [];
}
function cloneAcceptedRecruit(candidatePlayer, schoolId, nextYear, sequence) {
    const player = structuredClone(candidatePlayer);
    player.id = `${schoolId}-${nextYear}-1-target-${sequence}`;
    player.grade = 1;
    resetPromotedPlayer(player);
    return player;
}
function resolveRecruitmentAndAdvance(state, rng) {
    const nextYear = state.startYear + state.campaignYear;
    let graduatedPlayers = 0;
    let userResolution = {
        targetedCandidateIds: [...state.targetedCandidateIds],
        acceptedCandidateIds: [],
        rejectedCandidateIds: [...state.targetedCandidateIds],
        automaticIncomingCount: 0,
    };
    state.world.teams.forEach((team) => {
        const isUserTeam = team.profile.id === state.selectedSchoolId;
        const returning = team.roster.filter((player) => {
            if (player.grade === 3) {
                if (isUserTeam)
                    graduatedPlayers += 1;
                return false;
            }
            return true;
        });
        returning.forEach((player) => {
            player.grade = (player.grade + 1);
            resetPromotedPlayer(player);
        });
        const classSize = Math.max(8, team.profile.rosterTarget - returning.length);
        if (isUserTeam) {
            const targeted = state.targetedCandidateIds
                .map((id) => state.recruitCandidates.find((candidate) => candidate.id === id))
                .filter((candidate) => candidate !== undefined);
            const accepted = targeted.filter((candidate) => rng.bool(candidateAcceptanceProbability(candidate)));
            const acceptedPlayers = accepted
                .slice(0, classSize)
                .map((candidate, index) => cloneAcceptedRecruit(candidate.player, team.profile.id, nextYear, index + 1));
            const fillerCount = Math.max(0, classSize - acceptedPlayers.length);
            const filler = generateIncomingClass(team.profile, fillerCount, nextYear, rng, returning.length + acceptedPlayers.length);
            team.roster = [...returning, ...acceptedPlayers, ...filler];
            userResolution = {
                targetedCandidateIds: targeted.map((candidate) => candidate.id),
                acceptedCandidateIds: accepted.map((candidate) => candidate.id),
                rejectedCandidateIds: targeted
                    .filter((candidate) => !accepted.some((acceptedCandidate) => acceptedCandidate.id === candidate.id))
                    .map((candidate) => candidate.id),
                automaticIncomingCount: filler.length,
            };
        }
        else {
            const newcomers = generateIncomingClass(team.profile, classSize, nextYear, rng, returning.length);
            team.roster = [...returning, ...newcomers];
        }
        team.springSeedRank = null;
    });
    state.world.year = nextYear;
    state.world.day = 0;
    return { graduatedPlayers, resolution: userResolution };
}
function completedSeasonRecord(state, graduatedPlayers, recruitment) {
    const spring = state.currentSeason.spring;
    const summer = state.currentSeason.summer;
    const autumn = state.currentSeason.autumn;
    if (!spring || !summer || !autumn)
        throw new Error("The season cannot finish before all prefectural tournaments are complete");
    return {
        year: state.startYear + state.campaignYear - 1,
        campaignYear: state.campaignYear,
        spring,
        summer,
        autumn,
        userSpring: userTournamentSummary(spring, state.selectedSchoolId),
        userSummer: userTournamentSummary(summer, state.selectedSchoolId),
        userAutumn: userTournamentSummary(autumn, state.selectedSchoolId),
        regionalEvaluation: state.currentSeason.regionalEvaluation ?? defaultRegionalEvaluation(),
        graduatedPlayers,
        recruitment,
    };
}
function finishAcademicYear(state, rng) {
    const progression = resolveRecruitmentAndAdvance(state, rng);
    state.currentSeason.recruitmentResolution = progression.resolution;
    const record = completedSeasonRecord(state, progression.graduatedPlayers, progression.resolution);
    state.seasonHistory.push(record);
    const events = [event(state, "system", `${record.year}年度終了`, `${progression.graduatedPlayers}人が卒業。関心を示した候補から${progression.resolution.acceptedCandidateIds.length}人が入学しました。`, true)];
    if (state.campaignYear >= 3) {
        state.status = "complete";
        return events;
    }
    state.campaignYear += 1;
    state.week = 1;
    state.activeTournament = null;
    state.currentSeason = emptyCurrentSeason();
    state.lastDevelopment = [];
    state.recruitCandidates = [];
    state.targetedCandidateIds = [];
    state.gamePlan.preferredStarterId = null;
    events.push(event(state, "system", `${state.startYear + state.campaignYear - 1}年度開始`, "新入生を迎え、新しい1年が始まりました。", true));
    return events;
}
export function createManagerCampaign(profiles, selectedSchoolId, seed, startYear = 2026) {
    if (!profiles.some((profile) => profile.id === selectedSchoolId)) {
        throw new Error(`Unknown selected school: ${selectedSchoolId}`);
    }
    const state = {
        saveVersion: 1,
        appVersion: "0.3.0",
        seed,
        startYear,
        selectedSchoolId,
        campaignYear: 1,
        week: 1,
        status: "active",
        world: createSimulationWorld(profiles, seed, startYear),
        trainingPlan: cloneTrainingPlan(),
        gamePlan: cloneGamePlan(),
        activeTournament: null,
        currentSeason: emptyCurrentSeason(),
        seasonHistory: [],
        events: [],
        lastDevelopment: [],
        recruitCandidates: [],
        targetedCandidateIds: [],
    };
    state.events = [event(state, "system", "監督就任", "3年間の検証プレイを開始しました。毎週の方針を決めて進めます。", true)];
    return state;
}
function campaignIsComplete(state) {
    return state.status === "complete";
}
export function advanceCampaignWeek(state, rules, calendar) {
    if (state.status === "complete") {
        return { events: [], development: [], userGame: null, campaignCompleted: true };
    }
    const calendarWeek = calendar[state.week - 1];
    if (!calendarWeek)
        throw new Error(`Calendar week not found: ${state.week}`);
    const rng = createRng(`${state.seed}:campaign:${state.campaignYear}:week:${state.week}`);
    const generatedEvents = [];
    let development = [];
    let userGame = null;
    const tournamentKind = tournamentKindForWeek(state.week);
    if (tournamentKind !== null) {
        if (state.activeTournament === null) {
            state.activeTournament = startTournament(state, tournamentKind, rng);
            generatedEvents.push(event(state, "tournament", `${tournamentKind === "spring" ? "春季" : tournamentKind === "summer" ? "夏季" : "秋季"}県大会開幕`, tournamentKind === "summer" && state.activeTournament.seededSchoolIds.includes(state.selectedSchoolId)
                ? "春の結果によりシード校として大会へ入ります。"
                : "16校トーナメントが始まります。", true));
        }
        const roundResult = simulateTournamentRound(state, rules, rng);
        userGame = roundResult.game;
        generatedEvents.push(...roundResult.events);
        if (roundResult.completedResult !== null) {
            generatedEvents.push(...finalizeTournament(state, roundResult.completedResult));
            state.activeTournament = null;
        }
    }
    else {
        const training = trainNormalWeek(state, rng);
        development = training.deltas;
        state.lastDevelopment = development;
        generatedEvents.push(...training.events);
        if (state.week === 30)
            generatedEvents.push(...runRegionalEvaluation(state, rng));
        if (state.week === 31)
            generatedEvents.push(...generateScoutingPool(state, rng));
        if (state.week === 42)
            generatedEvents.push(...resolveSelectionAnnouncement(state, rng));
    }
    if (state.week === 52) {
        generatedEvents.push(...finishAcademicYear(state, rng));
        appendEvents(state, generatedEvents);
        return {
            events: generatedEvents,
            development,
            userGame,
            campaignCompleted: campaignIsComplete(state),
        };
    }
    state.week += 1;
    appendEvents(state, generatedEvents);
    return {
        events: generatedEvents,
        development,
        userGame,
        campaignCompleted: campaignIsComplete(state),
    };
}
export function setTargetCandidate(state, candidateId, selected) {
    const candidate = state.recruitCandidates.find((item) => item.id === candidateId);
    if (!candidate)
        throw new Error(`Recruit candidate was not found: ${candidateId}`);
    if (selected) {
        if (!candidate.eligible)
            return;
        if (state.targetedCandidateIds.includes(candidateId))
            return;
        if (state.targetedCandidateIds.length >= 3)
            throw new Error("関心を示せる候補は最大3人です");
        state.targetedCandidateIds = [...state.targetedCandidateIds, candidateId];
    }
    else {
        state.targetedCandidateIds = state.targetedCandidateIds.filter((id) => id !== candidateId);
    }
}
export function currentCalendarWeek(state, calendar) {
    const week = calendar[state.week - 1];
    if (!week)
        throw new Error(`Calendar week not found: ${state.week}`);
    return week;
}
export function isManagerCampaignState(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const record = value;
    return record.saveVersion === 1 &&
        record.appVersion === "0.3.0" &&
        typeof record.seed === "string" &&
        typeof record.selectedSchoolId === "string" &&
        typeof record.campaignYear === "number" &&
        typeof record.week === "number" &&
        typeof record.world === "object" &&
        Array.isArray(record.events);
}
