import { createRng } from "./rng.js";
import { developTeamForWeek } from "./development.js";
import { generateIncomingClass, generateInitialTeam } from "./player-generation.js";
import { assignSpringSeeds, simulateTournament } from "./tournament.js";
import { recoverPlayerForDays } from "./workload.js";
function advanceTrainingTo(world, targetDay, rng) {
    while (world.day < targetDay) {
        const step = Math.min(7, targetDay - world.day);
        world.day += step;
        world.teams.forEach((team) => {
            team.roster.forEach((player) => {
                recoverPlayerForDays(player, step);
                if (player.health.injuredUntilDay <= world.day) {
                    player.health.injuredUntilDay = -1;
                    if (player.health.fatigue < 38)
                        player.health.injuryRisk = "low";
                }
            });
            if (step >= 5)
                developTeamForWeek(team, rng, 1);
        });
    }
}
export function createSimulationWorld(schoolProfiles, seed, startYear = 2026) {
    const rng = createRng(`${seed}:world:${startYear}`);
    return {
        year: startYear,
        day: 0,
        teams: schoolProfiles.map((profile) => generateInitialTeam(profile, startYear, rng)),
    };
}
function advanceAcademicYear(world, rng) {
    let retired = 0;
    let incoming = 0;
    const nextYear = world.year + 1;
    world.teams.forEach((team) => {
        const returning = team.roster.filter((player) => {
            if (player.grade === 3) {
                retired += 1;
                return false;
            }
            return true;
        });
        returning.forEach((player) => {
            player.grade = (player.grade + 1);
            player.active = true;
            player.health.fatigue = 0;
            player.health.injuryRisk = "low";
            player.health.injuredUntilDay = -1;
            player.pitchingLog = [];
        });
        const classSize = Math.max(8, team.profile.rosterTarget - returning.length);
        const newcomers = generateIncomingClass(team.profile, classSize, nextYear, rng, returning.length);
        incoming += newcomers.length;
        team.roster = [...returning, ...newcomers];
        team.springSeedRank = null;
    });
    world.year = nextYear;
    world.day = 0;
    return { retired, incoming };
}
export function simulateSeason(world, rules, schedule, rng) {
    const seasonYear = world.year;
    advanceTrainingTo(world, schedule.springStartDay, rng);
    const spring = simulateTournament({
        kind: "spring",
        year: seasonYear,
        startDay: schedule.springStartDay,
        teams: world.teams,
        rules,
        allowColdGame: true,
    }, rng);
    const summerSeeds = assignSpringSeeds(world.teams, spring);
    world.day = schedule.springStartDay + 5;
    advanceTrainingTo(world, schedule.summerStartDay, rng);
    const summer = simulateTournament({
        kind: "summer",
        year: seasonYear,
        startDay: schedule.summerStartDay,
        teams: world.teams,
        rules,
        seededSchoolIds: summerSeeds,
        allowColdGame: true,
    }, rng);
    world.teams.forEach((team) => {
        team.roster.forEach((player) => {
            if (player.grade === 3)
                player.active = false;
        });
    });
    world.day = schedule.summerStartDay + 5;
    advanceTrainingTo(world, schedule.autumnStartDay, rng);
    const autumn = simulateTournament({
        kind: "autumn",
        year: seasonYear,
        startDay: schedule.autumnStartDay,
        teams: world.teams,
        rules,
        allowColdGame: true,
    }, rng);
    world.day = schedule.autumnStartDay + 5;
    advanceTrainingTo(world, schedule.seasonEndDay, rng);
    const progressionRng = createRng(`${seasonYear}:${rng.next()}:progression`);
    const progression = advanceAcademicYear(world, progressionRng);
    return {
        year: seasonYear,
        spring,
        summer,
        autumn,
        retiredPlayerCount: progression.retired,
        incomingPlayerCount: progression.incoming,
    };
}
