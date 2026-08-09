export const HIGH_SCHOOL_SEASON_SCHEDULE = Object.freeze({
    springStartDay: 7,
    summerStartDay: 91,
    autumnStartDay: 147,
    seasonEndDay: 364,
});
const MONTH_WEEK_COUNTS = [
    [4, 4], [5, 4], [6, 5], [7, 4], [8, 5], [9, 4],
    [10, 5], [11, 4], [12, 4], [1, 5], [2, 4], [3, 4],
];
function phaseForWeek(week) {
    if (week === 1)
        return "new-term";
    if (week <= 5)
        return "spring-tournament";
    if (week === 6)
        return "spring-review";
    if (week <= 13)
        return "summer-preparation";
    if (week <= 17)
        return "summer-tournament";
    if (week <= 21)
        return "summer-national-or-new-team";
    if (week <= 25)
        return "autumn-tournament";
    if (week === 26)
        return "regional-preparation";
    if (week <= 30)
        return "autumn-regional";
    if (week <= 34)
        return "late-autumn";
    if (week <= 39)
        return "winter-training";
    if (week <= 43)
        return "senbatsu-announcement";
    if (week <= 47)
        return "winter-training";
    if (week === 48)
        return "practice-resumption";
    if (week <= 50)
        return "spring-preparation";
    return "senbatsu-or-next-spring";
}
function titleForPhase(phase, week) {
    switch (phase) {
        case "new-term": return "新入生加入・年度開始";
        case "spring-tournament": return "春季県大会";
        case "spring-review": return "春の総括・夏シード確定";
        case "summer-preparation": return week === 13 ? "夏の抽選・登録20人決定" : "夏へ向けた育成・練習試合";
        case "summer-tournament": return "夏季県大会";
        case "summer-national-or-new-team": return "全国大会／新チーム始動";
        case "autumn-tournament": return "秋季県大会";
        case "regional-preparation": return "休養・地区大会準備";
        case "autumn-regional": return "秋季地区大会";
        case "late-autumn": return "練習試合・スカウト・冬季計画";
        case "winter-training": return "対外試合禁止・冬季育成";
        case "senbatsu-announcement": return week === 42 ? "選抜発表" : "冬季育成・選抜動向";
        case "practice-resumption": return "対外試合解禁";
        case "spring-preparation": return "実戦調整・春の編成";
        case "senbatsu-or-next-spring": return "選抜大会／次年度春への準備";
    }
}
function managerDecisionsForPhase(phase) {
    switch (phase) {
        case "new-term": return ["新入生の初期評価", "春の登録候補", "練習方針"];
        case "spring-tournament": return ["登録20人", "先発・継投", "DHと打順"];
        case "spring-review": return ["夏シード確認", "課題分析", "個人重点選手"];
        case "summer-preparation": return ["練習負荷", "コンバート", "夏のベンチ入り競争"];
        case "summer-tournament": return ["投手の連戦管理", "登録20人", "重要局面の采配"];
        case "summer-national-or-new-team": return ["3年生引退", "新主将", "秋の戦力再編"];
        case "autumn-tournament": return ["新チーム編成", "投手運用", "選抜評価につながる戦い"];
        case "regional-preparation": return ["休養優先度", "投手回復", "対戦準備"];
        case "autumn-regional": return ["地区枠獲得", "敗戦内容", "選抜評価"];
        case "late-autumn": return ["練習試合の目的", "中学生への接触", "冬の重点"];
        case "winter-training": return ["週ごとの育成重点", "負荷", "守備位置適性"];
        case "senbatsu-announcement": return ["選考見込み", "冬の育成", "春の役割競争"];
        case "practice-resumption": return ["冬の成果確認", "投手の実戦復帰", "春の候補選定"];
        case "spring-preparation": return ["練習試合", "登録候補", "投手起用順"];
        case "senbatsu-or-next-spring": return ["選抜出場時の運用", "新年度準備", "卒業処理"];
    }
}
function isOfficialCompetition(phase) {
    return [
        "spring-tournament",
        "summer-tournament",
        "summer-national-or-new-team",
        "autumn-tournament",
        "autumn-regional",
        "senbatsu-or-next-spring",
    ].includes(phase);
}
export function createHighSchoolCalendar() {
    const weeks = [];
    let week = 1;
    MONTH_WEEK_COUNTS.forEach(([month, count]) => {
        for (let weekOfMonth = 1; weekOfMonth <= count; weekOfMonth += 1) {
            const phase = phaseForWeek(week);
            weeks.push({
                week,
                month,
                weekOfMonth,
                label: `${month}月第${weekOfMonth}週`,
                phase,
                title: titleForPhase(phase, week),
                externalGamesAllowed: week < 35 || week >= 48,
                officialCompetition: isOfficialCompetition(phase),
                managerDecisions: managerDecisionsForPhase(phase),
            });
            week += 1;
        }
    });
    if (weeks.length !== 52)
        throw new Error(`Expected 52 calendar weeks, received ${weeks.length}`);
    return weeks;
}
export const HIGH_SCHOOL_CALENDAR = createHighSchoolCalendar();
