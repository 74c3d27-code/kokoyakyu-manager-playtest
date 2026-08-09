import { HIGH_SCHOOL_RULES_2026, appropriatePitchCount, battingOverall, pitchingOverall, prepareTeam, recentOfficialPitchCount, } from "../../../packages/baseball-engine/src/index.js";
import { HIGH_SCHOOL_CALENDAR } from "../../../packages/highschool-calendar/src/index.js";
import { SCHOOL_BY_ID, SCHOOL_PROFILES } from "../../../packages/highschool-data/src/index.js";
import { advanceCampaignWeek, createManagerCampaign, currentCalendarWeek, isManagerCampaignState, preferenceLabel, regionalStageLabel, setTargetCandidate, } from "../../../packages/manager-game/src/index.js";
const APP_VERSION = "0.3.0";
const STORAGE_KEY = "kokoyakyu-manager-playtest-v0.3.0";
const LEGACY_STORAGE_KEYS = ["kokoyakyu-manager-playtest-v0.2.0"];
const numberFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const ROUND_LABELS = ["1回戦", "準々決勝", "準決勝", "決勝"];
const appElement = document.querySelector("#app");
if (!appElement)
    throw new Error("#app was not found");
const app = appElement;
let campaign = loadCampaign();
let activeTab = "home";
let setupSchoolId = "pref-kawaminami";
let setupSeed = "KOKO-MANAGER-2026-001";
let errorMessage = "";
let noticeMessage = "";
const tabIcons = {
    home: "⌂",
    roster: "人",
    training: "育",
    tournament: "杯",
    scouting: "探",
    save: "保",
};
const tabLabels = {
    home: "ホーム",
    roster: "選手",
    training: "育成・起用",
    tournament: "大会",
    scouting: "スカウト",
    save: "保存・更新",
};
const focusLabels = {
    balanced: "総合",
    contact: "ミート",
    power: "長打",
    speed: "走力",
    defense: "守備",
    pitching: "投手",
    recovery: "回復",
};
const loadLabels = {
    light: "軽め",
    normal: "標準",
    heavy: "強め",
};
const targetLabels = {
    contact: "ミート",
    power: "長打",
    speed: "走力",
    fielding: "守備",
    arm: "肩",
    stuff: "球威",
    control: "制球",
    breaking: "変化球",
    stamina: "スタミナ",
    "position:P": "投手適性",
    "position:C": "捕手適性",
    "position:1B": "一塁適性",
    "position:2B": "二塁適性",
    "position:3B": "三塁適性",
    "position:SS": "遊撃適性",
    "position:LF": "左翼適性",
    "position:CF": "中堅適性",
    "position:RF": "右翼適性",
};
const allTrainingTargets = Object.keys(targetLabels);
render();
function loadCampaign() {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw)
            continue;
        try {
            const parsed = migrateCampaignSave(JSON.parse(raw));
            if (!isManagerCampaignState(parsed))
                continue;
            if (key !== STORAGE_KEY) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            }
            return parsed;
        }
        catch {
            // 壊れた保存データは次の候補へ進みます。
        }
    }
    return null;
}
function migrateCampaignSave(value) {
    if (typeof value !== "object" || value === null)
        return value;
    const record = value;
    if (record.saveVersion === 1 && record.appVersion === "0.2.0") {
        record.appVersion = APP_VERSION;
    }
    return record;
}
function saveCampaign() {
    if (campaign === null)
        return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(campaign));
}
function render() {
    document.body.classList.toggle("manager-campaign", campaign !== null);
    document.body.classList.toggle("manager-running", campaign?.status === "active");
    document.body.classList.toggle("manager-complete", campaign?.status === "complete");
    app.innerHTML = `
    ${renderHeader()}
    ${campaign === null ? renderSetup() : renderCampaign(campaign)}
  `;
    bindEvents();
}
function renderHeader() {
    return `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">
          <strong>高校野球監督ゲーム</strong>
          <small>3年間プレイ検証版 v${APP_VERSION}</small>
        </a>
        <nav class="header-links">
          <a href="/">入口</a>
          <a href="/lab/">検証室</a>
          <a href="/self-test/">端末確認</a>
        </nav>
      </div>
    </header>`;
}
function renderSetup() {
    const selected = SCHOOL_BY_ID.get(setupSchoolId) ?? SCHOOL_PROFILES[0];
    if (!selected)
        throw new Error("School data is empty");
    return `
    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">THREE-YEAR MANAGER PLAYTEST</p>
          <h1>一週間ずつ、三年間を預かる。</h1>
          <p>春・夏・秋の県大会、投手負荷、育成、守備位置適性、簡易スカウト、選抜評価、卒業と新入生までを一通り試せます。試合は自動進行です。</p>
        </div>
        <div class="setup-card">
          <h2>開始設定</h2>
          <label>世界シード
            <input id="setup-seed" value="${escapeHtml(setupSeed)}" maxlength="60">
          </label>
          <div>
            <span class="pill ${selected.ownership}">${selected.ownership === "public" ? "公立" : "私立"}</span>
            <h3>${escapeHtml(selected.name)}</h3>
            <p>${escapeHtml(selected.description)}</p>
          </div>
          <button id="start-campaign" class="primary-button" type="button">この学校で3年間を始める</button>
          <small>セーブはこのブラウザ内へ自動保存されます。</small>
        </div>
      </section>

      <section class="panel">
        <div class="section-heading">
          <div><p class="section-kicker">SCHOOL</p><h2>監督を務める学校</h2></div>
          <p>強豪校は戦力が厚い一方、今回の版では期待値や部員不満はまだ簡略化しています。</p>
        </div>
        <div class="school-grid">
          ${SCHOOL_PROFILES.map((school) => `
            <button class="school-choice ${school.id === setupSchoolId ? "selected" : ""}" data-school-id="${school.id}" type="button">
              <header><div><span class="pill ${school.ownership}">${school.ownership === "public" ? "公立" : "私立"}</span><h3>${escapeHtml(school.shortName)}</h3></div><span class="pill neutral">${escapeHtml(school.area)}</span></header>
              <p>${escapeHtml(school.description)}</p>
              <div class="school-stats">
                <div><span>評判</span><strong>${school.reputation}</strong></div>
                <div><span>設備</span><strong>${school.facilities}</strong></div>
                <div><span>指導</span><strong>${school.coaching}</strong></div>
                <div><span>部員目安</span><strong>${school.rosterTarget}人</strong></div>
              </div>
            </button>`).join("")}
        </div>
      </section>
    </main>`;
}
function renderCampaign(state) {
    const school = SCHOOL_BY_ID.get(state.selectedSchoolId);
    if (!school)
        throw new Error("Selected school profile is missing");
    const week = currentCalendarWeek(state, HIGH_SCHOOL_CALENDAR);
    const displayedYear = state.startYear + state.campaignYear - 1;
    return `
    <main>
      <div class="campaign-top">
        <div class="campaign-title">
          <p class="eyebrow">YEAR ${state.campaignYear} / 3</p>
          <h1>${escapeHtml(school.name)}</h1>
          <p>${displayedYear}年度・${state.status === "complete" ? "3年間の検証完了" : escapeHtml(week.title)}</p>
        </div>
        <div class="week-badge">
          <strong>${state.status === "complete" ? "検証完了" : escapeHtml(week.label)}</strong>
          <span>${state.status === "complete" ? "3シーズンを完走しました" : `第${state.week}週 / 52週`}</span>
        </div>
      </div>

      <nav class="tab-bar" aria-label="ゲーム画面">
        ${Object.keys(tabLabels).map((tab) => `
          <button class="tab-button ${tab === activeTab ? "active" : ""}" data-tab="${tab}" type="button" ${tab === activeTab ? 'aria-current="page"' : ""}><span class="tab-icon" aria-hidden="true">${tabIcons[tab]}</span><span>${tabLabels[tab]}</span></button>
        `).join("")}
      </nav>

      ${noticeMessage ? `<div class="notice-banner">${escapeHtml(noticeMessage)}</div>` : ""}
      ${errorMessage ? `<div class="error-banner">${escapeHtml(errorMessage)}</div>` : ""}
      ${state.status === "complete" ? renderCompletionBanner(state) : ""}
      ${renderActiveTab(state)}
    </main>
    ${state.status === "active" ? renderAdvanceBar(state) : ""}`;
}
function renderActiveTab(state) {
    switch (activeTab) {
        case "home": return renderHome(state);
        case "roster": return renderRoster(state);
        case "training": return renderTraining(state);
        case "tournament": return renderTournament(state);
        case "scouting": return renderScouting(state);
        case "save": return renderSave(state);
    }
}
function selectedTeam(state) {
    const team = state.world.teams.find((candidate) => candidate.profile.id === state.selectedSchoolId);
    if (!team)
        throw new Error("Selected team is missing");
    return team;
}
function activeKind(state) {
    if (state.activeTournament !== null)
        return state.activeTournament.kind;
    return state.currentSeason.summer !== null && state.currentSeason.autumn === null ? "autumn" : "spring";
}
function currentUserRecord(state) {
    const results = [state.currentSeason.spring, state.currentSeason.summer, state.currentSeason.autumn]
        .filter((result) => result !== null);
    let wins = 0;
    let losses = 0;
    results.forEach((result) => {
        result.games.forEach(({ game }) => {
            if (game.home.schoolId !== state.selectedSchoolId && game.away.schoolId !== state.selectedSchoolId)
                return;
            if (game.winnerSchoolId === state.selectedSchoolId)
                wins += 1;
            else
                losses += 1;
        });
    });
    if (state.activeTournament !== null) {
        state.activeTournament.games.forEach(({ game }) => {
            if (game.home.schoolId !== state.selectedSchoolId && game.away.schoolId !== state.selectedSchoolId)
                return;
            if (game.winnerSchoolId === state.selectedSchoolId)
                wins += 1;
            else
                losses += 1;
        });
    }
    return { wins, losses };
}
function renderHome(state) {
    const week = currentCalendarWeek(state, HIGH_SCHOOL_CALENDAR);
    const team = selectedTeam(state);
    const prepared = prepareTeam(team, state.world.day, activeKind(state), state.gamePlan);
    const record = currentUserRecord(state);
    const activePlayers = team.roster.filter((player) => player.active);
    const injured = activePlayers.filter((player) => player.health.injuredUntilDay > state.world.day);
    const pitchers = activePlayers
        .filter((player) => player.isPitcherCandidate)
        .sort((left, right) => pitchingOverall(right) - pitchingOverall(left))
        .slice(0, 5);
    const recentEvents = state.events.slice(0, 8);
    return `
    <section class="panel">
      <div class="metric-grid">
        ${metric("攻撃力", numberFormatter.format(prepared.offenseRating), "自動編成の打線評価")}
        ${metric("守備力", numberFormatter.format(prepared.defenseRating), "守備位置適性を反映")}
        ${metric("今季成績", `${record.wins}勝${record.losses}敗`, "県大会公式戦")}
        ${metric("離脱者", `${injured.length}人`, injured.length ? "選手画面で復帰時期を確認" : "現在は大きな離脱なし")}
      </div>

      <div class="mobile-quick-actions" aria-label="よく使う画面">
        <button class="secondary-button" data-tab="training" type="button">育成を設定</button>
        <button class="secondary-button" data-tab="tournament" type="button">大会を確認</button>
        <button class="secondary-button" data-tab="roster" type="button">選手を見る</button>
      </div>

      <div class="dashboard-grid">
        <article class="subpanel week-card">
          <p class="section-kicker">THIS WEEK</p>
          <strong>${escapeHtml(week.label)}　${escapeHtml(week.title)}</strong>
          <p>${week.officialCompetition ? "大会週です。内部では大会日程に応じて投手の休養日数を計算します。" : "通常週です。現在の育成方針を適用して一週間を進めます。"}</p>
          <ul class="decision-list">${week.managerDecisions.map((decision) => `<li>${escapeHtml(decision)}</li>`).join("")}</ul>
        </article>
        <article class="subpanel">
          <h3>主な投手</h3>
          <div class="pitcher-list">
            ${pitchers.map((player) => `
              <div class="pitcher-row">
                <strong>${escapeHtml(player.lastName)} ${escapeHtml(player.firstName)}</strong>
                <span>投${Math.round(pitchingOverall(player))}</span>
                ${riskPill(player)}
              </div>`).join("") || `<p class="empty-state">投手候補がいません。</p>`}
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">NEWS</p><h2>最近の出来事</h2></div><p>重要な大会結果や故障、募集状況を記録します。</p></div>
      ${recentEvents.length ? `<ul class="event-list">${recentEvents.map(renderEvent).join("")}</ul>` : `<div class="empty-state">まだ出来事はありません。</div>`}
    </section>`;
}
function renderRoster(state) {
    const team = selectedTeam(state);
    const players = [...team.roster].sort((left, right) => Number(right.active) - Number(left.active) ||
        right.grade - left.grade ||
        Math.max(pitchingOverall(right), battingOverall(right)) - Math.max(pitchingOverall(left), battingOverall(left)));
    return `
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">ROSTER</p><h2>選手一覧</h2></div><p>能力は検証用に数値表示しています。潜在上限そのものは表示せず、伸びしろだけを示します。</p></div>
      <div class="desktop-roster-table table-scroll">
        <table>
          <thead><tr><th>選手</th><th>学年・位置</th><th>ミート</th><th>長打</th><th>走力</th><th>守備</th><th>肩</th><th>球威</th><th>制球</th><th>変化</th><th>スタミナ</th><th>適性</th><th>疲労</th><th>伸びしろ</th></tr></thead>
          <tbody>${players.map((player) => renderPlayerRow(player, state)).join("")}</tbody>
        </table>
      </div>
      <div class="mobile-roster-list">${players.map((player) => renderPlayerCard(player, state)).join("")}</div>
    </section>`;
}
function renderPlayerRow(player, state) {
    const aptitude = player.positionAptitudes[player.primaryPosition];
    const status = !player.active
        ? `<span class="pill neutral">引退</span>`
        : player.health.injuredUntilDay > state.world.day
            ? `<span class="pill danger">離脱中</span>`
            : riskPill(player);
    return `<tr>
    <td><span class="player-name">${escapeHtml(player.lastName)} ${escapeHtml(player.firstName)}</span><br>${status}</td>
    <td>${player.grade}年・${player.primaryPosition}${player.isTwoWayCandidate ? "／二刀流候補" : ""}</td>
    ${abilityCell(player.batting.contact)}${abilityCell(player.batting.power)}${abilityCell(player.batting.speed)}${abilityCell(player.batting.fielding)}${abilityCell(player.batting.arm)}
    ${abilityCell(player.pitching.stuff)}${abilityCell(player.pitching.control)}${abilityCell(player.pitching.breaking)}${abilityCell(player.pitching.stamina)}
    <td>${Math.round(aptitude)}</td>
    <td>${Math.round(player.health.fatigue)}</td>
    <td>${potentialStatus(player)}</td>
  </tr>`;
}
function renderPlayerCard(player, state) {
    const aptitude = Math.round(player.positionAptitudes[player.primaryPosition]);
    const status = !player.active
        ? `<span class="pill neutral">引退</span>`
        : player.health.injuredUntilDay > state.world.day
            ? `<span class="pill danger">離脱中</span>`
            : riskPill(player);
    const ability = (label, value) => `<div><span>${label}</span><strong>${Math.round(value)}</strong></div>`;
    return `<article class="mobile-player-card ${player.active ? "" : "retired"}">
    <header>
      <div><h3>${escapeHtml(player.lastName)} ${escapeHtml(player.firstName)}</h3><p>${player.grade}年・${player.primaryPosition}${player.isTwoWayCandidate ? "／二刀流候補" : ""}</p></div>
      ${status}
    </header>
    <div class="mobile-ability-section">
      <h4>野手能力</h4>
      <div class="mobile-ability-grid">
        ${ability("ミート", player.batting.contact)}${ability("長打", player.batting.power)}${ability("走力", player.batting.speed)}${ability("守備", player.batting.fielding)}${ability("肩", player.batting.arm)}
      </div>
    </div>
    ${player.isPitcherCandidate ? `<div class="mobile-ability-section"><h4>投手能力</h4><div class="mobile-ability-grid four">${ability("球威", player.pitching.stuff)}${ability("制球", player.pitching.control)}${ability("変化", player.pitching.breaking)}${ability("体力", player.pitching.stamina)}</div></div>` : ""}
    <footer class="mobile-player-meta"><span>位置適性 <strong>${aptitude}</strong></span><span>疲労 <strong>${Math.round(player.health.fatigue)}</strong></span><span>伸びしろ <strong>${potentialStatus(player)}</strong></span></footer>
  </article>`;
}
function renderTraining(state) {
    const team = selectedTeam(state);
    const players = team.roster.filter((player) => player.active).sort((left, right) => right.grade - left.grade || left.lastName.localeCompare(right.lastName, "ja"));
    const pitchers = players.filter((player) => player.isPitcherCandidate);
    const assignments = Array.from({ length: 3 }, (_, index) => state.trainingPlan.assignments[index] ?? null);
    return `
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">TRAINING</p><h2>週間方針</h2></div><p>変更しない場合は同じ設定を翌週も引き継ぎます。</p></div>
      <form id="training-form">
        <div class="form-grid">
          <label class="form-field">チーム重点
            <select id="training-focus">${Object.keys(focusLabels).map((focus) => `<option value="${focus}" ${state.trainingPlan.focus === focus ? "selected" : ""}>${focusLabels[focus]}</option>`).join("")}</select>
          </label>
          <label class="form-field">練習負荷
            <select id="training-load">${Object.keys(loadLabels).map((load) => `<option value="${load}" ${state.trainingPlan.load === load ? "selected" : ""}>${loadLabels[load]}</option>`).join("")}</select>
          </label>
        </div>
        <div class="assignment-grid">
          <h3>個人重点・コンバート（最大3人）</h3>
          ${assignments.map((assignment, index) => `
            <div class="assignment-row">
              <span>${index + 1}</span>
              <select data-assignment-player>
                <option value="">指定なし</option>
                ${players.map((player) => `<option value="${player.id}" ${assignment?.playerId === player.id ? "selected" : ""}>${escapeHtml(player.lastName)} ${escapeHtml(player.firstName)}（${player.grade}年 ${player.primaryPosition}）</option>`).join("")}
              </select>
              <select data-assignment-target>
                ${allTrainingTargets.map((target) => `<option value="${target}" ${assignment?.target === target ? "selected" : ""}>${targetLabels[target]}</option>`).join("")}
              </select>
            </div>`).join("")}
        </div>
        <div class="help-box">「強め」は伸びやすい一方、疲労が増え、疲労が高い選手には練習故障の小さなリスクがあります。「回復」は成長量を抑えて疲労を抜きます。捕手・遊撃・投手の適性は他の守備位置より伸びにくく設定しています。</div>

        <div class="section-heading" style="margin-top:22px"><div><p class="section-kicker">GAME PLAN</p><h2>投手起用</h2></div><p>大会の各試合前に変更できます。</p></div>
        <div class="form-grid">
          <label class="form-field">先発候補
            <select id="preferred-starter">
              <option value="">自動選択</option>
              ${pitchers.map((player) => `<option value="${player.id}" ${state.gamePlan.preferredStarterId === player.id ? "selected" : ""}>${escapeHtml(player.lastName)} ${escapeHtml(player.firstName)}（投${Math.round(pitchingOverall(player))}・疲労${Math.round(player.health.fatigue)}）</option>`).join("")}
            </select>
          </label>
          <label class="form-field">投手運用
            <select id="pitcher-usage">
              <option value="ace-first" ${state.gamePlan.pitcherUsage === "ace-first" ? "selected" : ""}>エース優先</option>
              <option value="balanced" ${state.gamePlan.pitcherUsage === "balanced" ? "selected" : ""}>バランス</option>
              <option value="protect-health" ${state.gamePlan.pitcherUsage === "protect-health" ? "selected" : ""}>健康優先</option>
            </select>
          </label>
        </div>
        <div class="button-row" style="margin-top:14px"><button class="primary-button" type="submit">設定を保存</button></div>
      </form>
    </section>`;
}
function renderTournament(state) {
    const evaluation = state.currentSeason.regionalEvaluation;
    return `
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">TOURNAMENT</p><h2>今季の大会</h2></div><p>県大会は16校。春ベスト4が夏の4シードになります。</p></div>
      ${state.activeTournament ? renderActiveTournament(state) : ""}
      <div class="tournament-grid">
        ${renderTournamentCard("spring", state.currentSeason.spring, state)}
        ${renderTournamentCard("summer", state.currentSeason.summer, state)}
        ${renderTournamentCard("autumn", state.currentSeason.autumn, state)}
      </div>
      ${evaluation ? renderSelectionEvaluation(evaluation) : `<div class="empty-state selection-box">秋季県大会後、地区大会結果と選抜見込みを表示します。</div>`}
    </section>
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">HISTORY</p><h2>年度別成績</h2></div><p>3年間の結果を比較します。</p></div>
      ${state.seasonHistory.length ? `
        <div class="table-scroll"><table><thead><tr><th>年度</th><th>春</th><th>夏</th><th>秋</th><th>地区</th><th>選抜</th><th>卒業</th><th>獲得候補</th></tr></thead>
        <tbody>${state.seasonHistory.map((season) => `<tr><td>${season.year}</td><td>${season.userSpring.finish}</td><td>${season.userSummer.finish}</td><td>${season.userAutumn.finish}</td><td>${regionalStageLabel(season.regionalEvaluation.stage)}</td><td>${season.regionalEvaluation.selected ? "出場" : "なし"}</td><td>${season.graduatedPlayers}人</td><td>${season.recruitment?.acceptedCandidateIds.length ?? 0}人</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty-state">1年目の年度末に履歴が追加されます。</div>`}
    </section>`;
}
function renderActiveTournament(state) {
    const tournament = state.activeTournament;
    if (!tournament)
        return "";
    const nextRound = Math.min(4, tournament.nextRound);
    return `<article class="subpanel" style="margin-bottom:12px">
    <h3>進行中：${kindLabel(tournament.kind)}県大会　${ROUND_LABELS[nextRound - 1] ?? "終了"}</h3>
    <p style="color:var(--muted)">残存 ${tournament.currentRoundSchoolIds.length}校。夏大会では春シードを別ブロックへ配置しています。</p>
    ${renderGameRows(tournament.games.slice(-Math.max(1, tournament.currentRoundSchoolIds.length)))}
  </article>`;
}
function renderTournamentCard(kind, result, state) {
    if (!result)
        return `<article class="tournament-card"><h3>${kindLabel(kind)}<span class="pill neutral">未実施</span></h3><p>大会週に一ラウンドずつ進みます。</p></article>`;
    const finish = userFinish(result, state.selectedSchoolId);
    const champion = SCHOOL_BY_ID.get(result.championSchoolId)?.shortName ?? result.championSchoolId;
    return `<article class="tournament-card">
    <h3>${kindLabel(kind)}<span class="pill ${finish === "優勝" ? "good" : "neutral"}">${finish}</span></h3>
    <p>優勝：${escapeHtml(champion)}</p>
    <p>自校：${finish}</p>
    <div class="round-list">${renderGameRows(result.games.filter(({ game }) => game.home.schoolId === state.selectedSchoolId || game.away.schoolId === state.selectedSchoolId))}</div>
  </article>`;
}
function renderGameRows(records) {
    if (!records.length)
        return `<p>試合結果はまだありません。</p>`;
    return records.map(({ round, game }) => {
        const home = SCHOOL_BY_ID.get(game.home.schoolId)?.shortName ?? game.home.schoolId;
        const away = SCHOOL_BY_ID.get(game.away.schoolId)?.shortName ?? game.away.schoolId;
        return `<div class="game-row"><span class="away">${escapeHtml(away)}</span><strong>${game.away.runs}-${game.home.runs}</strong><span>${escapeHtml(home)}</span><small style="grid-column:1/-1;color:var(--muted)">${ROUND_LABELS[round - 1]}${game.endedByColdRule ? "・コールド" : game.usedTieBreak ? "・延長" : ""}</small></div>`;
    }).join("");
}
function renderSelectionEvaluation(evaluation) {
    return `<article class="subpanel selection-box">
    <div class="section-heading"><div><p class="section-kicker">SENBATSU</p><h3>選抜評価</h3></div><span class="pill ${evaluation.selected === true ? "good" : evaluation.outlook === "likely" || evaluation.outlook === "almost-certain" ? "warn" : "neutral"}">${selectionLabel(evaluation.outlook, evaluation.selected)}</span></div>
    <p style="color:var(--muted)">${regionalStageLabel(evaluation.stage)}。県大会成績、敗戦内容、好投手などを加味しています。</p>
    <div class="selection-reasons"><div><strong>評価された点</strong><ul>${evaluation.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>特記事項なし</li>"}</ul></div><div><strong>懸念点</strong><ul>${evaluation.concerns.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>大きな懸念なし</li>"}</ul></div></div>
  </article>`;
}
function renderScouting(state) {
    const candidates = state.recruitCandidates;
    return `
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">RECRUITING</p><h2>中学生候補</h2></div><p>関心を示せるのは最大3人。獲得確定ではなく、学校との相性で進学判断が行われます。</p></div>
      ${candidates.length === 0
        ? `<div class="empty-state">候補一覧は11月ごろ（第31週）に更新されます。公立は地域と学力、私立は推薦余地も含めて判定します。</div>`
        : `<p>選択中：<strong>${state.targetedCandidateIds.length} / 3人</strong></p><div class="recruit-grid">${candidates.map((candidate) => renderRecruitCard(candidate, state)).join("")}</div>`}
    </section>`;
}
function renderRecruitCard(candidate, state) {
    const targeted = state.targetedCandidateIds.includes(candidate.id);
    return `<article class="recruit-card ${targeted ? "targeted" : ""}">
    <div class="recruit-head"><div><span class="pill neutral">${candidate.player.primaryPosition}</span><h3>${escapeHtml(candidate.player.lastName)} ${escapeHtml(candidate.player.firstName)}</h3></div>${recruitOutlookPill(candidate.outlook)}</div>
    <p>${escapeHtml(candidate.area)}・学力目安 ${candidate.academicLevel}</p>
    <div class="recruit-facts">
      <div><span>現在評価</span><strong>${escapeHtml(candidate.estimateLabel)}</strong></div>
      <div><span>成長見込み</span><strong>${escapeHtml(candidate.potentialLabel)}</strong></div>
      <div><span>第一希望</span><strong>${preferenceLabel(candidate.primaryPreference)}</strong></div>
      <div><span>第二希望</span><strong>${preferenceLabel(candidate.secondaryPreference)}</strong></div>
    </div>
    <ul>${[...candidate.positives, ...candidate.concerns].slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <button class="${targeted ? "secondary-button" : "primary-button"}" data-candidate-id="${candidate.id}" data-candidate-selected="${targeted ? "true" : "false"}" ${!candidate.eligible ? "disabled" : ""} type="button">${!candidate.eligible ? "進学条件外" : targeted ? "関心を取り下げる" : "この選手に関心を示す"}</button>
  </article>`;
}
function renderSave(state) {
    return `
    <section class="panel">
      <div class="section-heading"><div><p class="section-kicker">SAVE</p><h2>保存・読み込み</h2></div><p>毎週の進行と設定変更時に、このブラウザへ自動保存しています。</p></div>
      <div class="save-grid">
        <article class="save-card"><h3>JSONバックアップ</h3><p>別の端末や別ブラウザへ移す場合に使います。書き出したファイルを保管してください。</p><div class="button-row"><button id="export-save" class="primary-button" type="button">セーブを書き出す</button><label class="file-label">セーブを読み込む<input id="import-save" type="file" accept="application/json,.json"></label></div></article>
        <article class="save-card"><h3>現在のセーブ</h3><p>シード：${escapeHtml(state.seed)}<br>進行：${state.campaignYear}年目・第${state.week}週<br>保存形式：v${state.saveVersion}</p><button id="reset-campaign" class="danger-button" type="button">このセーブを削除して最初から</button></article>
      </div>
    </section>`;
}
function renderCompletionBanner(state) {
    const total = state.seasonHistory.reduce((acc, season) => ({
        wins: acc.wins + season.userSpring.wins + season.userSummer.wins + season.userAutumn.wins,
        losses: acc.losses + season.userSpring.losses + season.userSummer.losses + season.userAutumn.losses,
        titles: acc.titles + [season.userSpring, season.userSummer, season.userAutumn].filter((item) => item.finish === "優勝").length,
    }), { wins: 0, losses: 0, titles: 0 });
    return `<section class="complete-banner" style="margin-bottom:15px"><p class="section-kicker">COMPLETE</p><h2>3年間の検証を完了しました</h2><p>県大会通算 ${total.wins}勝${total.losses}敗、優勝${total.titles}回。大会履歴、選手の成長、スカウト結果を確認できます。</p><div class="button-row"><button class="secondary-button" data-tab="tournament" type="button">3年間の大会結果</button><button class="secondary-button" data-tab="roster" type="button">最終選手一覧</button></div></section>`;
}
function renderAdvanceBar(state) {
    const week = currentCalendarWeek(state, HIGH_SCHOOL_CALENDAR);
    const tournament = state.activeTournament;
    const action = tournament
        ? `${kindLabel(tournament.kind)} ${ROUND_LABELS[Math.min(3, tournament.nextRound - 1)]}を実行`
        : tournamentKindForWeek(state.week)
            ? `${kindLabel(tournamentKindForWeek(state.week) ?? "spring")}を開始`
            : "今週を進める";
    return `<div class="advance-bar"><div class="advance-inner"><div class="advance-copy"><strong>${escapeHtml(week.label)}　${escapeHtml(week.title)}</strong><span>方針：${focusLabels[state.trainingPlan.focus]}／${loadLabels[state.trainingPlan.load]}・投手運用：${pitcherUsageLabel(state.gamePlan.pitcherUsage)}</span></div><button id="advance-week" class="primary-button advance-button" type="button">${action}</button></div></div>`;
}
function bindEvents() {
    document.querySelectorAll("[data-school-id]").forEach((button) => {
        button.addEventListener("click", () => {
            setupSchoolId = button.dataset.schoolId ?? setupSchoolId;
            const seedInput = document.querySelector("#setup-seed");
            setupSeed = seedInput?.value ?? setupSeed;
            render();
        });
    });
    document.querySelector("#setup-seed")?.addEventListener("input", (event) => {
        setupSeed = event.target.value;
    });
    document.querySelector("#start-campaign")?.addEventListener("click", () => {
        const seed = setupSeed.trim() || "KOKO-MANAGER-2026-001";
        campaign = createManagerCampaign(SCHOOL_PROFILES, setupSchoolId, seed, 2026);
        activeTab = "home";
        errorMessage = "";
        noticeMessage = "";
        saveCampaign();
        render();
    });
    document.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            const tab = button.dataset.tab;
            if (!tab || !(tab in tabLabels))
                return;
            activeTab = tab;
            errorMessage = "";
            noticeMessage = "";
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
    document.querySelector("#advance-week")?.addEventListener("click", () => {
        if (!campaign)
            return;
        try {
            advanceCampaignWeek(campaign, HIGH_SCHOOL_RULES_2026, HIGH_SCHOOL_CALENDAR);
            errorMessage = "";
            noticeMessage = "";
            saveCampaign();
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        catch (error) {
            noticeMessage = "";
            errorMessage = toErrorMessage(error);
            render();
        }
    });
    document.querySelector("#training-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!campaign)
            return;
        const focus = (document.querySelector("#training-focus")?.value ?? "balanced");
        const load = (document.querySelector("#training-load")?.value ?? "normal");
        const playerSelects = Array.from(document.querySelectorAll("[data-assignment-player]"));
        const targetSelects = Array.from(document.querySelectorAll("[data-assignment-target]"));
        const assignments = playerSelects.flatMap((select, index) => {
            const playerId = select.value;
            const target = targetSelects[index]?.value;
            return playerId && target ? [{ playerId, target }] : [];
        });
        campaign.trainingPlan = { focus, load, assignments };
        campaign.gamePlan = {
            preferredStarterId: document.querySelector("#preferred-starter")?.value || null,
            pitcherUsage: (document.querySelector("#pitcher-usage")?.value ?? "balanced"),
        };
        errorMessage = "";
        noticeMessage = "育成・起用設定を保存しました。";
        saveCampaign();
        render();
    });
    document.querySelectorAll("[data-candidate-id]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!campaign)
                return;
            try {
                setTargetCandidate(campaign, button.dataset.candidateId ?? "", button.dataset.candidateSelected !== "true");
                errorMessage = "";
                noticeMessage = "";
                saveCampaign();
                render();
            }
            catch (error) {
                noticeMessage = "";
                errorMessage = toErrorMessage(error);
                render();
            }
        });
    });
    document.querySelector("#export-save")?.addEventListener("click", () => {
        if (!campaign)
            return;
        downloadJson(`kokoyakyu-save-${campaign.seed}-${Date.now()}.json`, campaign);
    });
    document.querySelector("#import-save")?.addEventListener("change", async (event) => {
        const input = event.target;
        const file = input.files?.[0];
        if (!file)
            return;
        try {
            const parsed = JSON.parse(await file.text());
            if (!isManagerCampaignState(parsed))
                throw new Error("この版で読み込めるセーブ形式ではありません");
            campaign = parsed;
            activeTab = "home";
            errorMessage = "";
            noticeMessage = "セーブを読み込みました。";
            saveCampaign();
            render();
        }
        catch (error) {
            noticeMessage = "";
            errorMessage = toErrorMessage(error);
            render();
        }
    });
    document.querySelector("#reset-campaign")?.addEventListener("click", () => {
        if (!window.confirm("現在の3年間セーブを削除します。よろしいですか？"))
            return;
        localStorage.removeItem(STORAGE_KEY);
        campaign = null;
        activeTab = "home";
        errorMessage = "";
        noticeMessage = "";
        render();
    });
}
function tournamentKindForWeek(week) {
    if (week >= 2 && week <= 5)
        return "spring";
    if (week >= 14 && week <= 17)
        return "summer";
    if (week >= 22 && week <= 25)
        return "autumn";
    return null;
}
function metric(label, value, note) {
    return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}
function renderEvent(item) {
    return `<li class="event-item ${item.important ? "important" : ""}"><header><strong>${escapeHtml(item.title)}</strong><time>${item.year}年 第${item.week}週</time></header><p>${escapeHtml(item.detail)}</p></li>`;
}
function abilityCell(value) {
    const rounded = Math.round(value);
    return `<td class="${rounded >= 70 ? "ability-high" : rounded < 40 ? "ability-low" : ""}">${rounded}</td>`;
}
function potentialStatus(player) {
    const battingGap = Object.entries(player.battingPotential)
        .reduce((sum, [key, potential]) => sum + potential.hardCap - player.batting[key], 0) / 5;
    const pitchingGap = player.isPitcherCandidate
        ? Object.entries(player.pitchingPotential)
            .reduce((sum, [key, potential]) => sum + potential.hardCap - player.pitching[key], 0) / 4
        : 0;
    const gap = Math.max(battingGap, pitchingGap);
    if (gap >= 14)
        return "大きい";
    if (gap >= 8)
        return "あり";
    if (gap >= 4)
        return "小さい";
    return "完成に近い";
}
function riskPill(player) {
    const labels = { low: "低", caution: "注意", high: "高", danger: "危険" };
    const classes = { low: "good", caution: "warn", high: "danger", danger: "danger" };
    const recent = recentOfficialPitchCount(player, campaign?.world.day ?? 0);
    return `<span class="pill ${classes[player.health.injuryRisk]}" title="適正球数 ${Math.round(appropriatePitchCount(player))}・直近7日 ${recent}球">${labels[player.health.injuryRisk]}</span>`;
}
function kindLabel(kind) {
    return { spring: "春季", summer: "夏季", autumn: "秋季" }[kind];
}
function userFinish(result, schoolId) {
    if (result.championSchoolId === schoolId)
        return "優勝";
    if (result.runnerUpSchoolId === schoolId)
        return "準優勝";
    const loss = result.games.find(({ game }) => game.loserSchoolId === schoolId);
    if (loss?.round === 3)
        return "ベスト4";
    if (loss?.round === 2)
        return "ベスト8";
    return "1回戦敗退";
}
function selectionLabel(outlook, selected) {
    if (selected === true)
        return "選出";
    if (selected === false)
        return "非選出";
    return {
        "almost-certain": "ほぼ確実",
        likely: "有力",
        bubble: "当落線上",
        difficult: "厳しい",
        none: "可能性なし",
    }[outlook];
}
function recruitOutlookPill(outlook) {
    const labels = {
        "very-high": "非常に有力",
        high: "有力",
        medium: "五分",
        low: "厳しい",
        ineligible: "条件外",
    };
    const cls = outlook === "very-high" || outlook === "high" ? "good" : outlook === "medium" ? "warn" : outlook === "ineligible" ? "danger" : "neutral";
    return `<span class="pill ${cls}">${labels[outlook]}</span>`;
}
function pitcherUsageLabel(value) {
    return { "ace-first": "エース優先", balanced: "バランス", "protect-health": "健康優先" }[value];
}
function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
    }[character] ?? character));
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
