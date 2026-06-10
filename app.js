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
