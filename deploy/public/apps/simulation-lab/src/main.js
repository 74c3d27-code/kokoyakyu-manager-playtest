import { SCHOOL_BY_ID, SCHOOL_PROFILES } from "../../../packages/highschool-data/src/index.js";
import { HIGH_SCHOOL_CALENDAR } from "../../../packages/highschool-calendar/src/index.js";
const numberFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("ja-JP");
function requireElement(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Required element not found: ${id}`);
    return element;
}
const form = requireElement("simulation-form");
const seedInput = requireElement("seed-input");
const yearsInput = requireElement("years-input");
const repetitionsInput = requireElement("repetitions-input");
const runButton = requireElement("run-button");
const cancelButton = requireElement("cancel-button");
const statusText = requireElement("status-text");
const seasonCount = requireElement("season-count");
const progressBar = requireElement("progress-bar");
const errorMessage = requireElement("error-message");
const resultsSection = requireElement("results-section");
const summaryCards = requireElement("summary-cards");
const championBars = requireElement("champion-bars");
const abilitySummary = requireElement("ability-summary");
const aggregateTableBody = requireElement("aggregate-table-body");
const diagnosticList = requireElement("diagnostic-list");
const exportButton = requireElement("export-button");
const schoolCards = requireElement("school-cards");
const calendarGrid = requireElement("calendar-grid");
let activeWorker = null;
let lastResult = null;
const archetypeLabels = {
    "private-powerhouse": "私立強豪",
    "private-mid": "私立中堅",
    "private-rising": "私立新興",
    "public-powerhouse": "公立強豪",
    "public-mid": "公立中堅",
    "public-developing": "公立発展途上",
};
const styleLabels = {
    balanced: "総合型",
    power: "長打重視",
    contact: "巧打重視",
    speed: "機動力",
    defense: "守備重視",
    pitching: "投手重視",
};
function formatPercent(numerator, denominator) {
    if (denominator <= 0)
        return "0.0%";
    return `${numberFormatter.format((numerator / denominator) * 100)}%`;
}
function metricCard(label, value, note) {
    return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>`;
}
function schoolName(schoolId) {
    return SCHOOL_BY_ID.get(schoolId)?.shortName ?? schoolId;
}
function ownershipLabel(profile) {
    return profile.ownership === "public" ? "公立" : "私立";
}
function renderSchoolCards() {
    schoolCards.innerHTML = SCHOOL_PROFILES.map((school) => `
    <article class="school-card ${school.ownership}">
      <div class="school-card-head">
        <div>
          <span class="school-tag">${archetypeLabels[school.archetype]}</span>
          <h3>${school.shortName}</h3>
        </div>
        <span class="area-tag">${school.area}</span>
      </div>
      <p>${school.description}</p>
      <dl class="school-stats">
        <div><dt>評判</dt><dd><meter min="0" max="100" value="${school.reputation}"></meter><span>${school.reputation}</span></dd></div>
        <div><dt>設備</dt><dd><meter min="0" max="100" value="${school.facilities}"></meter><span>${school.facilities}</span></dd></div>
        <div><dt>指導</dt><dd><meter min="0" max="100" value="${school.coaching}"></meter><span>${school.coaching}</span></dd></div>
        <div><dt>獲得</dt><dd><meter min="0" max="100" value="${school.recruiting}"></meter><span>${school.recruiting}</span></dd></div>
      </dl>
      <div class="school-card-foot">
        <span>${styleLabels[school.style]}</span>
        <span>学力 ${school.academicLevel}</span>
        <span>部員目安 ${school.rosterTarget}</span>
      </div>
    </article>
  `).join("");
}
function renderCalendar() {
    const monthGroups = new Map();
    HIGH_SCHOOL_CALENDAR.forEach((week) => {
        const group = monthGroups.get(week.month) ?? [];
        group.push(week);
        monthGroups.set(week.month, group);
    });
    calendarGrid.innerHTML = [...monthGroups.entries()].map(([month, weeks]) => `
    <article class="month-card">
      <h3>${month}月</h3>
      <div class="month-weeks">
        ${weeks.map((week) => {
        const stateClass = !week.externalGamesAllowed ? "banned" : week.officialCompetition ? "official" : "training";
        return `
            <div class="calendar-week ${stateClass}">
              <span>第${week.weekOfMonth}週・通算${week.week}</span>
              <strong>${week.title}</strong>
              <small>${week.managerDecisions.slice(0, 2).join("／")}</small>
            </div>`;
    }).join("")}
      </div>
    </article>
  `).join("");
}
function currentTotalSeasons() {
    const years = Number(yearsInput.value);
    const repetitions = Number(repetitionsInput.value);
    return Number.isFinite(years) && Number.isFinite(repetitions) ? years * repetitions : 0;
}
function updateSeasonCount() {
    seasonCount.textContent = `${integerFormatter.format(currentTotalSeasons())}シーズン`;
}
function setRunning(running) {
    runButton.disabled = running;
    cancelButton.disabled = !running;
    seedInput.disabled = running;
    yearsInput.disabled = running;
    repetitionsInput.disabled = running;
}
function showError(message) {
    errorMessage.hidden = false;
    errorMessage.textContent = message;
}
function clearError() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
}
function aggregateRow(aggregate) {
    const school = SCHOOL_BY_ID.get(aggregate.schoolId);
    if (!school)
        return "";
    return `
    <tr>
      <th scope="row">${school.shortName}</th>
      <td><span class="ownership-pill ${school.ownership}">${ownershipLabel(school)}</span></td>
      <td>${integerFormatter.format(aggregate.games)}</td>
      <td>${integerFormatter.format(aggregate.wins)}</td>
      <td>${integerFormatter.format(aggregate.losses)}</td>
      <td>${integerFormatter.format(aggregate.springTitles)}</td>
      <td><strong>${integerFormatter.format(aggregate.summerTitles)}</strong></td>
      <td>${integerFormatter.format(aggregate.autumnTitles)}</td>
    </tr>`;
}
function renderDiagnostics(result) {
    const messages = [];
    const averageRuns = result.games > 0 ? result.totalRuns / result.games : 0;
    const publicShare = result.publicSummerTitles / Math.max(1, result.seasons);
    const seedWinRate = result.seededSummerWins / Math.max(1, result.seededSummerGames);
    const battingGrowth = result.finalAbilitySnapshot.averageBatting - result.initialAbilitySnapshot.averageBatting;
    const pitchingGrowth = result.finalAbilitySnapshot.averagePitchingForPitchers - result.initialAbilitySnapshot.averagePitchingForPitchers;
    const injuryRate = result.injuries / Math.max(1, result.games);
    if (averageRuns > 12)
        messages.push("1試合の合計得点が高めです。打撃確率か投手交代の調整候補です。");
    else if (averageRuns < 5)
        messages.push("1試合の合計得点が低めです。投手優位になりすぎていないか確認してください。");
    else
        messages.push("平均得点は初期検証として極端な打高・投高にはなっていません。");
    if (publicShare < 0.18)
        messages.push("公立校の夏優勝比率が低めです。獲得力差または設備差を弱める余地があります。");
    else if (publicShare > 0.72)
        messages.push("私立強豪の優位が弱めです。評判・設備・選手層の効果を確認してください。");
    else
        messages.push("公立と私立の夏優勝比率は、一方が完全に独占する状態ではありません。");
    if (seedWinRate > 0.72)
        messages.push("シード校の勝率が高めです。シード配置と戦力差が重なりすぎている可能性があります。");
    else if (seedWinRate < 0.5)
        messages.push("シードの優位が小さめです。春の成績が夏に十分つながっているか確認してください。");
    else
        messages.push("春のシードは有利ですが、夏の勝利を保証するほどではありません。");
    if (battingGrowth > 8 || pitchingGrowth > 8)
        messages.push("長期進行で能力上昇が大きめです。潜在上限と新入生生成のインフレを確認してください。");
    else
        messages.push("初期値から最終値への平均能力変化は、現時点で急激なインフレではありません。");
    if (injuryRate > 0.08)
        messages.push("故障発生が多めです。高リスク登板の確率か回復量を調整してください。");
    else
        messages.push("故障は発生しますが、現時点では毎試合のように起きる頻度ではありません。");
    diagnosticList.innerHTML = messages.map((message) => `<li>${message}</li>`).join("");
}
function renderResult(result) {
    lastResult = result;
    const averageRuns = result.games > 0 ? result.totalRuns / result.games : 0;
    summaryCards.innerHTML = [
        metricCard("処理シーズン", integerFormatter.format(result.seasons), `${result.yearsPerRun}年 × ${result.repetitions}回`),
        metricCard("公式戦", integerFormatter.format(result.games), "春・夏・秋の県大会"),
        metricCard("平均合計得点", numberFormatter.format(averageRuns), "1試合あたり"),
        metricCard("コールド率", formatPercent(result.coldGames, result.games), `${integerFormatter.format(result.coldGames)}試合`),
        metricCard("延長率", formatPercent(result.extraInningGames, result.games), "10回からタイブレーク"),
        metricCard("シード勝率", formatPercent(result.seededSummerWins, result.seededSummerGames), "夏のシード校出場試合"),
        metricCard("公立の夏優勝", formatPercent(result.publicSummerTitles, result.seasons), `${result.publicSummerTitles} / ${result.seasons}`),
        metricCard("投手故障", integerFormatter.format(result.injuries), `危険登板 ${result.dangerPitcherAppearances}`),
    ].join("");
    const ranked = [...result.schoolAggregates].sort((left, right) => right.summerTitles - left.summerTitles || right.wins - left.wins);
    const maximumTitles = Math.max(1, ...ranked.map((aggregate) => aggregate.summerTitles));
    championBars.innerHTML = ranked.map((aggregate) => {
        const school = SCHOOL_BY_ID.get(aggregate.schoolId);
        const width = Math.max(2, (aggregate.summerTitles / maximumTitles) * 100);
        return `
      <div class="bar-row">
        <span>${school?.shortName ?? aggregate.schoolId}</span>
        <div class="bar-track"><i style="width:${width}%"></i></div>
        <strong>${aggregate.summerTitles}</strong>
      </div>`;
    }).join("");
    const initial = result.initialAbilitySnapshot;
    const final = result.finalAbilitySnapshot;
    abilitySummary.innerHTML = `
    <div class="ability-grid">
      <div><span>平均野手総合</span><strong>${numberFormatter.format(initial.averageBatting)} → ${numberFormatter.format(final.averageBatting)}</strong></div>
      <div><span>平均投手総合</span><strong>${numberFormatter.format(initial.averagePitchingForPitchers)} → ${numberFormatter.format(final.averagePitchingForPitchers)}</strong></div>
      <div><span>最高野手総合</span><strong>${numberFormatter.format(final.bestBatting)}</strong></div>
      <div><span>最高投手総合</span><strong>${numberFormatter.format(final.bestPitching)}</strong></div>
      <div><span>高リスク登板</span><strong>${integerFormatter.format(result.highRiskPitcherAppearances)}</strong></div>
      <div><span>500球到達交代</span><strong>${integerFormatter.format(result.pitchLimitStops)}</strong></div>
    </div>`;
    aggregateTableBody.innerHTML = ranked.map(aggregateRow).join("");
    renderDiagnostics(result);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}
function createSimulationWorker() {
    const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event) => {
        const data = event.data;
        if (data.type === "progress") {
            const completed = data.completed ?? 0;
            const total = data.total ?? 1;
            progressBar.max = total;
            progressBar.value = completed;
            statusText.textContent = `反復 ${completed} / ${total} を完了`;
            return;
        }
        if (data.type === "result" && data.result) {
            setRunning(false);
            statusText.textContent = "完了";
            renderResult(data.result);
            activeWorker?.terminate();
            activeWorker = null;
            return;
        }
        if (data.type === "error") {
            setRunning(false);
            statusText.textContent = "エラー";
            showError(data.message ?? "シミュレーションに失敗しました。");
            activeWorker?.terminate();
            activeWorker = null;
        }
    });
    worker.addEventListener("error", (event) => {
        setRunning(false);
        statusText.textContent = "エラー";
        showError(event.message || "Workerの実行に失敗しました。");
        worker.terminate();
        activeWorker = null;
    });
    return worker;
}
form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();
    const years = Number(yearsInput.value);
    const repetitions = Number(repetitionsInput.value);
    const totalSeasons = years * repetitions;
    const baseSeed = seedInput.value.trim();
    if (!baseSeed) {
        showError("基準シードを入力してください。");
        return;
    }
    if (!Number.isInteger(years) || years < 1 || years > 100) {
        showError("年数は1～100の整数で指定してください。");
        return;
    }
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
        showError("反復回数は1～100の整数で指定してください。");
        return;
    }
    if (totalSeasons > 5000) {
        showError("処理量が大きすぎます。年数×反復回数を5,000以下にしてください。");
        return;
    }
    activeWorker?.terminate();
    activeWorker = createSimulationWorker();
    setRunning(true);
    resultsSection.hidden = true;
    progressBar.max = repetitions;
    progressBar.value = 0;
    statusText.textContent = "選手と16校を生成中";
    activeWorker.postMessage({
        type: "run",
        options: { baseSeed, years, repetitions, startYear: 2026 },
    });
});
cancelButton.addEventListener("click", () => {
    activeWorker?.terminate();
    activeWorker = null;
    setRunning(false);
    statusText.textContent = "中止しました";
    progressBar.value = 0;
});
[yearsInput, repetitionsInput].forEach((input) => input.addEventListener("input", updateSeasonCount));
exportButton.addEventListener("click", () => {
    if (!lastResult)
        return;
    const payload = {
        generatedAt: new Date().toISOString(),
        engineVersion: "0.3.0",
        result: lastResult,
        schools: SCHOOL_PROFILES,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kokoyakyu-simulation-${lastResult.baseSeed.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
});
renderSchoolCards();
renderCalendar();
updateSeasonCount();
