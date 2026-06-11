/* ==========================================================
   2026 美加墨世界杯 · 赛程与比分追踪
   核心逻辑 JS：数据加载 / Tab 切换 / 筛选 / 倒计时 / 积分榜 / 射手榜
   ========================================================== */

let allMatches = [];
let allTeams = {};
let topScorers = [];
let flagCdnBase = "https://flagcdn.com/w40";
let currentFilter = {
    search: '',
    group: 'all',
    date: 'all',
    status: 'all',
    stage: 'all',
    tab: 'all'
};

// 城市中文名映射
const CITY_CN = {
    "East Rutherford, NJ": "东卢瑟福",
    "Los Angeles, CA": "洛杉矶",
    "Arlington, TX": "阿灵顿",
    "Miami Gardens, FL": "迈阿密花园",
    "Atlanta, GA": "亚特兰大",
    "Houston, TX": "休斯顿",
    "Philadelphia, PA": "费城",
    "Seattle, WA": "西雅图",
    "Santa Clara, CA": "圣克拉拉",
    "Kansas City, MO": "堪萨斯城",
    "Foxborough, MA": "福克斯堡",
    "Mexico City": "墨西哥城",
    "Guadalajara": "瓜达拉哈拉",
    "Monterrey": "蒙特雷",
    "Toronto, ON": "多伦多",
    "Vancouver, BC": "温哥华",
};

// 城市时区映射（UTC偏移小时数）
const CITY_TIMEZONE = {
    "East Rutherford, NJ": -4,  // 美国东部时间 (UTC-4)
    "Los Angeles, CA": -7,      // 美国太平洋时间 (UTC-7)
    "Arlington, TX": -5,        // 美国中部时间 (UTC-5)
    "Miami Gardens, FL": -4,    // 美国东部时间 (UTC-4)
    "Atlanta, GA": -4,          // 美国东部时间 (UTC-4)
    "Houston, TX": -5,          // 美国中部时间 (UTC-5)
    "Philadelphia, PA": -4,     // 美国东部时间 (UTC-4)
    "Seattle, WA": -7,          // 美国太平洋时间 (UTC-7)
    "Santa Clara, CA": -7,      // 美国太平洋时间 (UTC-7)
    "Kansas City, MO": -5,      // 美国中部时间 (UTC-5)
    "Foxborough, MA": -4,       // 美国东部时间 (UTC-4)
    "Mexico City": -6,          // 墨西哥城时间 (UTC-6)
    "Guadalajara": -6,          // 墨西哥中部时间 (UTC-6)
    "Monterrey": -6,            // 墨西哥中部时间 (UTC-6)
    "Toronto, ON": -4,          // 加拿大东部时间 (UTC-4)
    "Vancouver, BC": -7,        // 加拿大太平洋时间 (UTC-7)
};

/* ============= 工具函数 ============= */

function formatDateCN(dateStr) {
    const d = new Date(dateStr);
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

function formatTime(dateStr) {
    const d = new Date(dateStr);
    // 北京时间 (UTC+8)
    const utc = d.getTime() + d.getTimezoneOffset() * 60 * 1000;
    const beijingTime = new Date(utc + 8 * 60 * 60 * 1000);
    const h = String(beijingTime.getHours()).padStart(2, '0');
    const m = String(beijingTime.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function formatTimeLocal(dateStr, city) {
    // 根据城市时区计算当地时间
    const d = new Date(dateStr);
    const utc = d.getTime() + d.getTimezoneOffset() * 60 * 1000;
    const timezoneOffset = CITY_TIMEZONE[city] || -5; // 默认 UTC-5
    const localTime = new Date(utc + timezoneOffset * 60 * 60 * 1000);
    const h = String(localTime.getHours()).padStart(2, '0');
    const m = String(localTime.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function getDateKey(dateStr) {
    const d = new Date(dateStr);
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMatchStatus(match) {
    if (match.status) return match.status;
    const now = new Date();
    const matchDate = new Date(match.date);
    if (match.homeScore !== undefined) return 'finished';
    if (matchDate < now) return 'upcoming';
    return 'upcoming';
}

function getStatusText(status) {
    return {
        'upcoming': '即将开始',
        'live': '🔴 进行中',
        'finished': '已结束'
    }[status] || status;
}

function getRoundLabel(match) {
    if (!match.group && match.round) return match.round;
    if (match.group && match.matchday) return `${match.group} 组 · 第${match.matchday}轮`;
    return match.round || '';
}

function getUniqueDates(matches) {
    const dates = new Set();
    matches.forEach(m => dates.add(getDateKey(m.date)));
    return [...dates].sort();
}

/** 生成国旗图片 HTML（优先用 ISO 代码，fallback 到 emoji） */
function flagImg(team, sizeClass = 'team-flag-img') {
    if (team && team.iso) {
        const url = `${flagCdnBase}/${team.iso}.png`;
        return `<img class="${sizeClass}" src="${url}" alt="${team.flag || 'flag'}" onerror="this.replaceWith(document.createTextNode(this.alt))">`;
    }
    if (team && team.flag) {
        return `<span class="team-flag-emoji">${team.flag}</span>`;
    }
    return '';
}

/* ============= 数据加载 ============= */

async function loadData() {
    try {
        const res = await fetch('matches.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        allMatches = data.matches || [];
        allTeams = data.teams || {};
        topScorers = data.topScorers || [];
        if (data.flagCdn) flagCdnBase = data.flagCdn;
        document.getElementById('last-updated').textContent =
            data.lastUpdated || new Date().toLocaleString('zh-CN');
        initPage();
    } catch (err) {
        console.error('数据加载失败：', err);
        document.getElementById('matches-container').innerHTML =
            `<div class="loading">
                <p>⚠️ 数据加载失败</p>
                <p style="font-size:0.85rem;margin-top:8px;color:#b0bec5;">${err.message}</p>
            </div>`;
    }
}

/* ============= 页面初始化 ============= */

function initPage() {
    populateDateFilter();
    bindEvents();
    updateCountdown();
    setInterval(updateCountdown, 1000);
    renderAll();
}

function populateDateFilter() {
    const dates = getUniqueDates(allMatches);
    const select = document.getElementById('date-filter');
    dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        // 转换为北京时间显示
        const dateObj = new Date(d);
        const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60 * 1000;
        const beijingDate = new Date(utc + 8 * 60 * 60 * 1000);
        opt.textContent = `${beijingDate.getMonth() + 1}月${beijingDate.getDate()}日`;
        select.appendChild(opt);
    });
}

function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            currentFilter.tab = btn.dataset.tab;
            const sectionId = {
                'all': 'matches-section',
                'upcoming': 'matches-section',
                'finished': 'matches-section',
                'standings': 'standings-section',
                'scorers': 'scorers-section',
                'today': 'today-section'
            }[currentFilter.tab] || 'matches-section';
            document.getElementById(sectionId).classList.add('active');
            renderAll();
        });
    });

    document.getElementById('team-search').addEventListener('input', e => {
        currentFilter.search = e.target.value.trim();
        renderMatches();
    });
    document.getElementById('group-filter').addEventListener('change', e => {
        currentFilter.group = e.target.value;
        renderMatches();
    });
    document.getElementById('date-filter').addEventListener('change', e => {
        currentFilter.date = e.target.value;
        renderMatches();
    });
    document.getElementById('status-filter').addEventListener('change', e => {
        currentFilter.status = e.target.value;
        renderMatches();
    });
    document.getElementById('stage-filter').addEventListener('change', e => {
        currentFilter.stage = e.target.value;
        renderMatches();
    });
}

/* ============= 倒计时 ============= */

function updateCountdown() {
    const now = new Date();
    let nextMatch = null;

    for (const m of allMatches) {
        if (getMatchStatus(m) === 'live') { nextMatch = m; break; }
    }

    if (!nextMatch) {
        const upcoming = allMatches
            .filter(m => {
                const d = new Date(m.date);
                return d > now && getMatchStatus(m) !== 'finished';
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        nextMatch = upcoming[0];
    }

    const nextMatchEl = document.getElementById('next-match');
    const label = document.getElementById('cd-label');

    if (!nextMatch) {
        document.getElementById('cd-days').textContent = '0';
        document.getElementById('cd-hours').textContent = '0';
        document.getElementById('cd-mins').textContent = '0';
        document.getElementById('cd-secs').textContent = '0';
        if (label) label.textContent = '赛事已全部结束';
        nextMatchEl.textContent = '🎉 世界杯已全部结束';
        return;
    }

    const targetDate = new Date(nextMatch.date);
    const status = getMatchStatus(nextMatch);

    if (status === 'live') {
        if (label) label.textContent = '比赛进行中';
        document.getElementById('cd-days').textContent = '⚽';
        document.getElementById('cd-hours').textContent = '⚽';
        document.getElementById('cd-mins').textContent = '⚽';
        document.getElementById('cd-secs').textContent = '⚽';
        nextMatchEl.innerHTML =
            `${flagImg(nextMatch.home)} ${nextMatch.home.name} vs ${flagImg(nextMatch.away)} ${nextMatch.away.name}`;
        return;
    }

    const diff = targetDate - now;
    if (diff <= 0) {
        nextMatchEl.textContent = `即将开球：${nextMatch.home.name} vs ${nextMatch.away.name}`;
        return;
    }

    if (label) label.textContent = '距离下一场比赛';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('cd-days').textContent = days;
    document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');

    nextMatchEl.innerHTML =
        `${flagImg(nextMatch.home)} ${nextMatch.home.name} vs ${flagImg(nextMatch.away)} ${nextMatch.away.name} · ${formatDateCN(nextMatch.date)}`;
}

/* ============= 筛选 ============= */

function filterMatches(matches) {
    return matches.filter(m => {
        if (currentFilter.tab === 'upcoming' && getMatchStatus(m) === 'finished') return false;
        if (currentFilter.tab === 'finished' && getMatchStatus(m) !== 'finished') return false;
        if (currentFilter.search) {
            const q = currentFilter.search.toLowerCase();
            if (!m.home.name.toLowerCase().includes(q) &&
                !m.away.name.toLowerCase().includes(q)) return false;
        }
        if (currentFilter.stage !== 'all') {
            if (currentFilter.stage === 'group') { if (!m.group) return false; }
            else if (currentFilter.stage === 'knockout') { if (m.group) return false; }
        }
        if (currentFilter.group !== 'all') {
            if (currentFilter.group === 'KO') { if (m.group) return false; }
            else if (m.group !== currentFilter.group) return false;
        }
        if (currentFilter.date !== 'all') {
            if (getDateKey(m.date) !== currentFilter.date) return false;
        }
        if (currentFilter.status !== 'all') {
            if (getMatchStatus(m) !== currentFilter.status) return false;
        }
        return true;
    });
}

/* ============= 比赛卡片渲染 ============= */

function renderMatches() {
    const container = document.getElementById('matches-container');
    if (!allMatches.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>暂无数据</div>`;
        return;
    }
    let filtered = filterMatches(allMatches);
    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>没有找到匹配的比赛</div>`;
        return;
    }
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '';
    let lastDate = '';
    filtered.forEach(match => {
        const dKey = getDateKey(match.date);
        if (dKey !== lastDate) {
            html += `<div class="date-header">${formatDateCN(match.date)}</div>`;
            lastDate = dKey;
        }
        html += renderMatchCard(match);
    });
    container.innerHTML = html;
}

function renderMatchCard(match) {
    const status = getMatchStatus(match);
    const hasScore = (status === 'finished' || status === 'live') && match.homeScore !== undefined;
    let homeWinner = false, awayWinner = false;
    if (hasScore) {
        if (match.homeScore > match.awayScore) homeWinner = true;
        else if (match.awayScore > match.homeScore) awayWinner = true;
    }

    const scoreHtml = hasScore
        ? `<div class="match-score">
             <span class="${homeWinner ? 'winner' : ''}">${match.homeScore}</span>
             <small>-</small>
             <span class="${awayWinner ? 'winner' : ''}">${match.awayScore}</span>
           </div>`
        : `<div class="match-score vs">VS</div>`;

    const roundLabel = getRoundLabel(match);

    return `
        <div class="match-card ${status}">
            <div class="match-card-header">
                <span class="match-badge">${roundLabel}</span>
                <span class="match-status ${status}">${getStatusText(status)}</span>
            </div>
            <div class="match-teams">
                <div class="team ${homeWinner ? 'match-winner' : ''}">
                    <span class="team-flag-box">${flagImg(match.home)}</span>
                    <span class="team-name">${match.home.name}</span>
                </div>
                ${scoreHtml}
                <div class="team ${awayWinner ? 'match-winner' : ''}">
                    <span class="team-flag-box">${flagImg(match.away)}</span>
                    <span class="team-name">${match.away.name}</span>
                </div>
            </div>
            <div class="match-footer">
                <span class="venue">📍 ${CITY_CN[match.city] || match.city || match.venue}（${match.venue}）</span>
                <span class="time">⏰ 北京时间 ${formatTime(match.date)} (当地 ${formatTimeLocal(match.date, match.city)})</span>
            </div>
        </div>
    `;
}

/* ============= 今日比赛 ============= */

function renderTodayMatches() {
    const container = document.getElementById('today-container');
    const today = getDateKey(new Date());
    const todayMatches = allMatches
        .filter(m => getDateKey(m.date) === today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!todayMatches.length) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="emoji">☕</span>
                今天没有世界杯比赛
            </div>`;
        return;
    }
    container.innerHTML = todayMatches.map(renderMatchCard).join('');
}

/* ============= 积分榜 ============= */

function renderStandings() {
    const container = document.getElementById('standings-container');
    const groups = {};
    allMatches.forEach(m => {
        if (m.group) {
            if (!groups[m.group]) groups[m.group] = [];
            groups[m.group].push(m);
        }
    });
    if (!Object.keys(groups).length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">📊</span>暂无小组赛数据</div>`;
        return;
    }
    const sortedGroups = Object.keys(groups).sort();
    let html = '<div class="standings-wrapper">';
    sortedGroups.forEach(group => {
        const matches = groups[group];
        const stats = {};
        matches.forEach(m => {
            [m.home, m.away].forEach(team => {
                if (!stats[team.name]) {
                    stats[team.name] = {
                        name: team.name, iso: team.iso, flag: team.flag,
                        played: 0, wins: 0, draws: 0, losses: 0,
                        goalsFor: 0, goalsAgainst: 0, points: 0
                    };
                }
            });
            if (getMatchStatus(m) === 'finished' && m.homeScore !== undefined) {
                const hs = m.homeScore, as = m.awayScore;
                stats[m.home.name].played++; stats[m.away.name].played++;
                stats[m.home.name].goalsFor += hs; stats[m.home.name].goalsAgainst += as;
                stats[m.away.name].goalsFor += as; stats[m.away.name].goalsAgainst += hs;
                if (hs > as) { stats[m.home.name].wins++; stats[m.home.name].points += 3; stats[m.away.name].losses++; }
                else if (as > hs) { stats[m.away.name].wins++; stats[m.away.name].points += 3; stats[m.home.name].losses++; }
                else { stats[m.home.name].draws++; stats[m.away.name].draws++; stats[m.home.name].points++; stats[m.away.name].points++; }
            }
        });
        const sorted = Object.values(stats).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst;
            if (gdB !== gdA) return gdB - gdA;
            return b.goalsFor - a.goalsFor;
        });

        html += `
            <div class="standings-card">
                <div class="standings-card-header">${group} 组积分榜</div>
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th class="team-col">球队</th>
                            <th>赛</th>
                            <th>胜</th>
                            <th>平</th>
                            <th>负</th>
                            <th>进/失</th>
                            <th class="gd">净</th>
                            <th>分</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((t, idx) => {
                            const gd = t.goalsFor - t.goalsAgainst;
                            const qualify = idx < 2 ? 'qualify' : '';
                            return `
                                <tr class="${qualify}">
                                    <td class="rank">${idx + 1}</td>
                                    <td class="team-col">
                                        <span class="team-flag-box small">${flagImg(t, 'team-flag-img small')}</span>
                                        ${t.name}
                                    </td>
                                    <td>${t.played}</td>
                                    <td>${t.wins}</td>
                                    <td>${t.draws}</td>
                                    <td>${t.losses}</td>
                                    <td>${t.goalsFor}-${t.goalsAgainst}</td>
                                    <td class="gd">${gd > 0 ? '+' + gd : gd}</td>
                                    <td class="points">${t.points}</td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

/* ============= 射手榜 ============= */

function renderTopScorers() {
    const container = document.getElementById('scorers-container');
    if (!topScorers || !topScorers.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">🥅</span>暂无射手榜数据</div>`;
        return;
    }
    const sorted = [...topScorers].sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        return (a.name || '').localeCompare(b.name || '');
    });

    let html = `<div class="standings-card scorers-card">
        <div class="standings-card-header">🏆 世界杯射手榜</div>
        <table class="standings-table scorers-table">
            <thead>
                <tr>
                    <th>排名</th>
                    <th class="player-col">球员</th>
                    <th class="team-col">国家</th>
                    <th>位置</th>
                    <th>⚽ 进球</th>
                    <th>🎯 助攻</th>
                    <th>出场</th>
                    <th>合计</th>
                </tr>
            </thead>
            <tbody>`;
    sorted.forEach((p, idx) => {
        const total = (p.goals || 0) + (p.assists || 0);
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
        html += `
            <tr class="${idx < 3 ? 'qualify' : ''}">
                <td class="rank">${medal}</td>
                <td class="player-col">${p.name}</td>
                <td class="team-col">
                    <span class="team-flag-box small">${flagImg({iso: p.team_iso, flag: p.team_flag}, 'team-flag-img small')}</span>
                    ${p.team}
                </td>
                <td>${p.position || '-'}</td>
                <td class="points">${p.goals}</td>
                <td>${p.assists}</td>
                <td>${p.matches}</td>
                <td class="points">${total}</td>
            </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/* ============= 主渲染 ============= */

function renderAll() {
    if (currentFilter.tab === 'standings') {
        renderStandings();
    } else if (currentFilter.tab === 'scorers') {
        renderTopScorers();
    } else if (currentFilter.tab === 'today') {
        renderTodayMatches();
    } else {
        renderMatches();
    }
}

/* ============= 启动 ============= */

// 自动刷新相关变量
let refreshInterval = null;
const REFRESH_INTERVAL_MINUTES = 30; // 每30分钟刷新一次

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    startAutoRefresh();
});

// 启动自动刷新
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    // 每30分钟刷新一次
    refreshInterval = setInterval(() => {
        console.log(`🔄 自动刷新数据 (每 ${REFRESH_INTERVAL_MINUTES} 分钟)`);
        loadData();
    }, REFRESH_INTERVAL_MINUTES * 60 * 1000);
    
    // 更新刷新状态显示
    updateRefreshStatus();
}

// 更新刷新状态显示
function updateRefreshStatus() {
    const statusDiv = document.getElementById('refresh-status');
    if (statusDiv) {
        statusDiv.innerHTML = `⏱️ 自动刷新: 开启 (每 ${REFRESH_INTERVAL_MINUTES} 分钟)`;
    }
}

// 手动刷新按钮点击
function manualRefresh() {
    console.log('🔄 手动刷新数据...');
    loadData();
}

// 截图工具相关变量
let screenshotCanvas = null;
let screenshotFlagImages = {};

// 打开截图设置面板
function openScreenshotPanel() {
    const modal = document.getElementById('screenshot-modal');
    modal.classList.add('active');
    
    // 设置默认日期（今天和7天后）
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    document.getElementById('screenshot-start-date').value = formatDateInput(today);
    document.getElementById('screenshot-end-date').value = formatDateInput(nextWeek);
    
    // 禁止页面滚动
    document.body.style.overflow = 'hidden';
}

// 关闭截图设置面板
function closeScreenshotPanel() {
    const modal = document.getElementById('screenshot-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // 清空预览
    document.getElementById('preview-container').innerHTML = 
        '<div class="preview-placeholder">调整参数后点击下方按钮生成预览</div>';
    screenshotCanvas = null;
}

// 格式化日期为 input 格式
function formatDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 快速设置日期范围
function setQuickDate(type) {
    const startInput = document.getElementById('screenshot-start-date');
    const endInput = document.getElementById('screenshot-end-date');
    const today = new Date();
    
    switch(type) {
        case 'today':
            startInput.value = formatDateInput(today);
            endInput.value = formatDateInput(today);
            break;
        case 'week':
            startInput.value = formatDateInput(today);
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);
            endInput.value = formatDateInput(nextWeek);
            break;
        case 'month':
            startInput.value = formatDateInput(today);
            const nextMonth = new Date();
            nextMonth.setMonth(today.getMonth() + 1);
            endInput.value = formatDateInput(nextMonth);
            break;
        case 'all':
            startInput.value = '';
            endInput.value = '';
            break;
    }
}

// 获取当前设置的筛选条件
function getScreenshotSettings() {
    return {
        startDate: document.getElementById('screenshot-start-date').value,
        endDate: document.getElementById('screenshot-end-date').value,
        cols: parseInt(document.getElementById('screenshot-cols').value),
        stage: document.getElementById('screenshot-stage').value
    };
}

// 根据设置筛选比赛
function filterMatchesForScreenshot(settings) {
    let filtered = [...allMatches];
    
    // 日期筛选
    if (settings.startDate) {
        const start = new Date(settings.startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(m => {
            const matchDate = new Date(m.date);
            return matchDate >= start;
        });
    }
    
    if (settings.endDate) {
        const end = new Date(settings.endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(m => {
            const matchDate = new Date(m.date);
            return matchDate <= end;
        });
    }
    
    // 阶段筛选
    if (settings.stage === 'group') {
        filtered = filtered.filter(m => m.group);
    } else if (settings.stage === 'knockout') {
        filtered = filtered.filter(m => !m.group);
    }
    
    // 按日期排序
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return filtered;
}

// 生成预览
function generatePreview() {
    if (!allMatches || allMatches.length === 0) {
        alert('暂无赛程数据');
        return;
    }
    
    const settings = getScreenshotSettings();
    const matches = filterMatchesForScreenshot(settings);
    
    if (matches.length === 0) {
        alert('当前筛选条件下没有比赛');
        return;
    }
    
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '<div class="preview-placeholder">正在生成预览...</div>';
    
    // 收集国旗
    const isoCodes = new Set();
    matches.forEach(m => {
        if (m.home && m.home.iso) isoCodes.add(m.home.iso);
        if (m.away && m.away.iso) isoCodes.add(m.away.iso);
    });
    
    // 加载国旗
    const loadPromises = [];
    screenshotFlagImages = {};
    
    isoCodes.forEach(iso => {
        if (screenshotFlagImages[iso]) {
            loadPromises.push(Promise.resolve());
            return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const url = `https://flagcdn.com/w80/${iso}.png`;
        const p = new Promise(resolve => {
            img.onload = () => { screenshotFlagImages[iso] = img; resolve(); };
            img.onerror = () => resolve();
        });
        img.src = url;
        loadPromises.push(p);
    });
    
    Promise.all(loadPromises).then(() => {
        // 生成预览画布（缩小版）
        screenshotCanvas = generateScheduleImage(matches, settings.cols, settings.stage);
        
        // 清空并显示预览
        previewContainer.innerHTML = '';
        previewContainer.appendChild(screenshotCanvas);
        
        console.log(`预览生成完成！${matches.length} 场比赛，${settings.cols} 列布局`);
    });
}

// 生成赛程图片（核心函数）- 固定尺寸 1320 x 2868 (19.5:9)
function generateScheduleImage(matches, cols = 2, stage = 'all') {
    // 按日期分组
    const matchByDate = new Map();
    matches.forEach(m => {
        const dateKey = formatDateCN(m.date);
        if (!matchByDate.has(dateKey)) matchByDate.set(dateKey, []);
        matchByDate.get(dateKey).push(m);
    });
    
    const totalMatchCount = matches.length;
    const stageText = stage === 'group' ? '小组赛' : stage === 'knockout' ? '淘汰赛' : '全部阶段';
    
    // ============ 固定画布尺寸：1320 (宽) x 2868 (高) = 19.5:9 ============
    const canvasW = 1320;
    const canvasH = 2868;
    
    // ============ 基础尺寸参数（相对画布大小设计） ============
    const padding = 45;
    const titleHeight = 180;
    const footerHeight = 50;
    const gapX = 18;
    const gapY = 12;
    
    // 列宽（根据列数分配宽度）
    const colW = (canvasW - padding * 2 - gapX * (cols - 1)) / cols;
    
    // ============ 计算总行数，推算缩放比例 ============
    let totalDateHeaders = matchByDate.size; // 日期标题数量
    let totalCardRows = 0;
    matchByDate.forEach(cards => {
        totalCardRows += Math.ceil(cards.length / cols);
    });
    
    // 日期标题高度比例：每一个日期标题占一个单位行高
    const dateHeaderRatio = 0.35; // 日期标题 = 0.35 倍卡片高度
    
    // 可用内容区高度 = 总高度 - 上下padding - 标题区 - 底部
    const availableH = canvasH - padding * 2 - titleHeight - footerHeight;
    
    // 内容高度 = dateHeader数 * dateHeaderH + cardRow数 * cardH + 间隙
    // dateHeaderH = cardH * dateHeaderRatio
    // 设 cardH 为基准单位，求内容能放得下的最大 cardH
    const totalUnits = totalDateHeaders * dateHeaderRatio + totalCardRows;
    const totalGap = (totalDateHeaders + totalCardRows) * gapY;
    
    // 解: totalUnits * cardH + totalGap = availableH
    let cardH = Math.floor((availableH - totalGap) / totalUnits);
    let dateHeaderH = Math.floor(cardH * dateHeaderRatio);
    
    // 设置最小卡片高度（内容多时不至于文字挤成一团）
    if (cardH < 80) cardH = 80;
    if (dateHeaderH < 30) dateHeaderH = 30;
    
    // ============ 字体大小（根据卡片高度动态缩放） ============
    // 基准：cardH = 200 时使用以下字体大小
    const fontScale = Math.min(1.0, cardH / 200);
    
    const titleFont = Math.floor(62 * Math.min(1.2, cardH / 200));       // 主标题
    const titleSubFont = Math.floor(32 * Math.min(1.2, cardH / 200));    // 副标题
    const metaFont = Math.max(16, Math.floor(22 * Math.min(1.2, cardH / 200))); // 元信息
    const dateFont = Math.max(18, Math.floor(30 * fontScale));           // 日期
    const teamFont = Math.max(16, Math.floor(28 * fontScale));           // 球队名
    const scoreFont = Math.max(20, Math.floor(36 * fontScale));          // 比分
    const timeFont = Math.max(12, Math.floor(20 * fontScale));           // 时间
    const venueFont = Math.max(11, Math.floor(18 * fontScale));          // 场馆
    const badgeFont = Math.max(12, Math.floor(20 * fontScale));          // 徽章
    
    // ============ 创建画布 ============
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 背景渐变
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, '#0a0e27');
    grad.addColorStop(0.5, '#16204a');
    grad.addColorStop(1, '#0a0e27');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 金色边框
    ctx.strokeStyle = 'rgba(255,215,0,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding - 8, padding - 8, canvasW - padding * 2 + 16, canvasH - padding * 2 + 16);
    
    // ============ 标题区 ============
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${titleFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText('🏆 2026 美加墨世界杯', canvasW / 2, padding + titleFont + 10);
    
    ctx.shadowBlur = 0;
    ctx.font = `bold ${titleSubFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(`${stageText} · 共 ${totalMatchCount} 场`, canvasW / 2, padding + titleFont + titleSubFont + 35);
    
    ctx.fillStyle = '#8899bb';
    ctx.font = `${metaFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText(`更新: ${new Date().toLocaleString('zh-CN')}`, canvasW / 2, padding + titleFont + titleSubFont + metaFont + 70);
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding + 80, padding + titleHeight - 10);
    ctx.lineTo(canvasW - padding - 80, padding + titleHeight - 10);
    ctx.stroke();
    
    // ============ 绘制比赛内容 ============
    let y = padding + titleHeight;
    
    matchByDate.forEach((cards, dateTitle) => {
        // 日期标题
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${dateFont}px "Microsoft YaHei", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('📅 ' + dateTitle, padding, y + dateFont);
        
        // 日期分隔线
        ctx.strokeStyle = 'rgba(255,215,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, y + dateHeaderH - 3);
        ctx.lineTo(canvasW - padding, y + dateHeaderH - 3);
        ctx.stroke();
        
        y += dateHeaderH;
        
        // 多列绘制
        cards.forEach((match, idx) => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const cardX = padding + col * (colW + gapX);
            const cardY = y + row * (cardH + gapY);
            
            drawMatchCard(ctx, match, cardX, cardY, colW, cardH - 5,
                          { teamFont, scoreFont, timeFont, venueFont, badgeFont }, screenshotFlagImages);
        });
        
        const groupRows = Math.ceil(cards.length / cols);
        y += groupRows * cardH + (groupRows - 1) * gapY + 3;
    });
    
    // ============ 底部 ============
    ctx.fillStyle = '#667799';
    ctx.font = `${Math.max(14, metaFont - 4)}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚽ 2026 FIFA World Cup · USA / Canada / Mexico', canvasW / 2, canvasH - padding / 2);
    
    return canvas;
}

// 下载截图
function downloadScreenshot() {
    if (!screenshotCanvas) {
        alert('请先生成预览');
        return;
    }
    
    try {
        const link = document.createElement('a');
        const settings = getScreenshotSettings();
        const dateStr = new Date().toISOString().split('T')[0];
        link.download = `worldcup_${settings.cols}col_${dateStr}.png`;
        link.href = screenshotCanvas.toDataURL('image/png');
        link.click();
        console.log('截图已下载');
    } catch (e) {
        console.error('下载失败:', e);
        alert('下载失败: ' + e.message);
    }
}

// 绘制单张比赛卡片 - 对称对齐版本
function drawMatchCard(ctx, match, x, y, w, h, fonts, flagImages) {
    const { teamFont, scoreFont, timeFont, venueFont, badgeFont } = fonts;
    
    const cardScale = h / 200;
    
    // ========== 圆角卡片背景 ==========
    const radius = Math.max(6, Math.floor(14 * cardScale));
    const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
    cardGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    cardGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.25)';
    ctx.lineWidth = Math.max(1, 1.5 * cardScale);
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
    
    // ========== 三分区高度 ==========
    const topH = Math.max(34, badgeFont + 18);
    const bottomH = Math.max(30, timeFont + 18);
    const middleH = h - topH - bottomH;
    const margin = Math.max(10, 12 * cardScale);
    
    // ========== 顶部徽章 ==========
    const badgeH = Math.max(20, badgeFont + 10);
    const badgeY = y + (topH - badgeH) / 2;
    
    let badgeText = '';
    if (match.group) {
        badgeText = `${match.group}组 · ${match.round || ''}`.trim();
    } else if (match.round) {
        badgeText = match.round;
    }
    
    if (badgeText) {
        const maxBadgeChars = Math.floor((w / 2 - margin * 2) / (badgeFont * 0.62));
        if (badgeText.length > maxBadgeChars) badgeText = badgeText.substring(0, maxBadgeChars) + '…';
        const badgeW = Math.max(badgeFont * 5.5, badgeText.length * badgeFont * 0.62 + badgeFont * 1.2);
        const bx = x + margin;
        ctx.fillStyle = '#ffd700';
        roundRect(ctx, bx, badgeY, badgeW, badgeH, Math.floor(badgeH / 3));
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.font = `bold ${badgeFont}px "Microsoft YaHei", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + badgeW / 2, badgeY + badgeH / 2);
    }
    
    const status = getMatchStatus(match);
    let statusText = '即将开始';
    let statusColor = '#4caf50';
    if (status === 'finished') { statusText = '已结束'; statusColor = '#7a8599'; }
    else if (status === 'live') { statusText = '⚡进行中'; statusColor = '#ff6b6b'; }
    const statusBadgeW = Math.max(badgeFont * 5.5, statusText.length * badgeFont * 0.62 + badgeFont * 1.2);
    const sbx = x + w - margin - statusBadgeW;
    ctx.fillStyle = statusColor;
    roundRect(ctx, sbx, badgeY, statusBadgeW, badgeH, Math.floor(badgeH / 3));
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${badgeFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusText, sbx + statusBadgeW / 2, badgeY + badgeH / 2);
    
    // ========== 中部核心：对称布局 ==========
    // 垂直中心基准线（国旗、队名、VS 都在这条线上）
    const centerY = y + topH + middleH / 2;
    const centerX = x + w / 2;
    
    // 元素尺寸
    const flagH = Math.min(middleH * 0.45, teamFont * 2.0);
    const flagW = flagH * 1.5;
    const gap = Math.max(6, Math.floor(8 * cardScale));
    
    // 比赛信息
    const homeName = match.home?.name || 'TBD';
    const awayName = match.away?.name || 'TBD';
    const homeIso = match.home?.iso;
    const awayIso = match.away?.iso;
    const homeScore = (match.home_score !== undefined && match.home_score !== null) ? match.home_score : null;
    const awayScore = (match.away_score !== undefined && match.away_score !== null) ? match.away_score : null;
    
    // 测量文字宽度
    ctx.font = `bold ${scoreFont}px Arial, sans-serif`;
    const vsText = (homeScore !== null && awayScore !== null) ? `${homeScore} : ${awayScore}` : 'VS';
    const vsWidth = ctx.measureText(vsText).width;
    
    ctx.font = `bold ${teamFont}px "Microsoft YaHei", Arial, sans-serif`;
    const maxTextWidth = w / 2 - vsWidth / 2 - flagW - gap * 3 - margin;
    
    let displayHome = homeName;
    if (ctx.measureText(displayHome).width > maxTextWidth) {
        while (displayHome.length > 2 && ctx.measureText(displayHome + '…').width > maxTextWidth) {
            displayHome = displayHome.substring(0, displayHome.length - 1);
        }
        displayHome += '…';
    }
    
    let displayAway = awayName;
    if (ctx.measureText(displayAway).width > maxTextWidth) {
        while (displayAway.length > 2 && ctx.measureText(displayAway + '…').width > maxTextWidth) {
            displayAway = displayAway.substring(0, displayAway.length - 1);
        }
        displayAway += '…';
    }
    
    const homeTextW = ctx.measureText(displayHome).width;
    const awayTextW = ctx.measureText(displayAway).width;
    
    // ========== 精确坐标计算 ==========
    // 布局：[margin] 🇨🇦 队名 [gap-gap] VS [gap-gap] 队名 🇿🇦 [margin]
    //                    ^                                      ^
    //            homeContentRightX                    awayContentLeftX
    // 主场内容块（国旗+队名）总宽 = flagW + gap + homeTextW
    // 客场内容块（队名+国旗）总宽 = awayTextW + gap + flagW
    
    const homeContentW = flagW + gap + homeTextW;
    const awayContentW = awayTextW + gap + flagW;
    
    // 主场内容块右侧对齐到 centerX - vsWidth/2 - gap
    // 客场内容块左侧对齐到 centerX + vsWidth/2 + gap
    const homeContentRightX = centerX - vsWidth / 2 - gap;
    const awayContentLeftX = centerX + vsWidth / 2 + gap;
    
    // 主场各元素 x 坐标
    const homeFlagX = homeContentRightX - homeContentW;  // 国旗左边
    const homeTextX = homeContentRightX - homeTextW;      // 队名左边
    
    // 客场各元素 x 坐标
    const awayTextX = awayContentLeftX;                   // 队名左边
    const awayFlagX = awayContentLeftX + awayTextW + gap; // 国旗左边
    
    // 边界检查：如果超出边缘，整体内移
    let homeShift = 0;
    if (homeFlagX < x + margin) {
        homeShift = x + margin - homeFlagX;
    }
    let awayShift = 0;
    if (awayFlagX + flagW > x + w - margin) {
        awayShift = x + w - margin - (awayFlagX + flagW);
    }
    
    // ========== 绘制主场 ==========
    if (homeIso && flagImages[homeIso]) {
        ctx.drawImage(flagImages[homeIso], homeFlagX + homeShift, centerY - flagH / 2, flagW, flagH);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${teamFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayHome, homeTextX + homeShift, centerY);
    
    // ========== 绘制 VS/比分 ==========
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${scoreFont}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(vsText, centerX, centerY);
    
    // ========== 绘制客场 ==========
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${teamFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayAway, awayTextX + awayShift, centerY);
    
    if (awayIso && flagImages[awayIso]) {
        ctx.drawImage(flagImages[awayIso], awayFlagX + awayShift, centerY - flagH / 2, flagW, flagH);
    }
    
    // ========== 底部：时间 + 场馆 ==========
    const bottomCenterY = y + topH + middleH + bottomH / 2;
    const bottomMargin = Math.max(10, 12 * cardScale);
    
    const timeStr = formatTime(match.date) + ' 北京时间';
    ctx.fillStyle = '#aabbcc';
    ctx.font = `${timeFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let timeDisplay = '⏰ ' + timeStr;
    const maxTimeWidth = w / 2 - bottomMargin;
    if (ctx.measureText(timeDisplay).width > maxTimeWidth) {
        while (timeDisplay.length > 5 && ctx.measureText(timeDisplay + '…').width > maxTimeWidth) {
            timeDisplay = timeDisplay.substring(0, timeDisplay.length - 1);
        }
        timeDisplay += '…';
    }
    ctx.fillText(timeDisplay, x + bottomMargin, bottomCenterY);
    
    let venueStr = '';
    if (match.venue) venueStr = match.venue;
    else if (match.city) venueStr = match.city;
    
    if (venueStr) {
        ctx.fillStyle = '#aabbcc';
        ctx.font = `${venueFont}px "Microsoft YaHei", Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        let venueDisplay = '📍 ' + venueStr;
        if (ctx.measureText(venueDisplay).width > maxTimeWidth) {
            while (venueDisplay.length > 5 && ctx.measureText(venueDisplay + '…').width > maxTimeWidth) {
                venueDisplay = venueDisplay.substring(0, venueDisplay.length - 1);
            }
            venueDisplay += '…';
        }
        ctx.fillText(venueDisplay, x + w - bottomMargin, bottomCenterY);
    }
}

// 辅助函数：绘制圆角矩形
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// 备用截图方法
function fallbackScreenshot() {
    console.log('使用备用截图方法...');
    
    const matchesContainer = document.getElementById('matches-container');
    let textContent = '🏆 2026 美加墨世界杯\n';
    textContent += '===================\n\n';
    
    const matchCards = matchesContainer.querySelectorAll('.match-card');
    matchCards.forEach((card, index) => {
        const teams = card.querySelectorAll('.team-name');
        const time = card.querySelector('.time');
        const venue = card.querySelector('.venue');
        
        if (teams.length === 2) {
            textContent += `${index + 1}. ${teams[0].textContent.trim()} vs ${teams[1].textContent.trim()}\n`;
            if (time) textContent += `   ⏰ ${time.textContent.trim()}\n`;
            if (venue) textContent += `   📍 ${venue.textContent.trim()}\n`;
            textContent += '\n';
        }
    });
    
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `worldcup_schedule_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    
    console.log('📋 赛程文本已保存！');
}

// 切换自动刷新开关
function toggleAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        document.getElementById('refresh-status').innerHTML = '⏱️ 自动刷新: 关闭';
        document.getElementById('toggle-refresh').textContent = '开启自动刷新';
    } else {
        startAutoRefresh();
        document.getElementById('toggle-refresh').textContent = '关闭自动刷新';
    }
}
