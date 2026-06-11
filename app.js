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

// 一键生图功能（固定 iPhone 12 Pro Max 屏幕尺寸 1284x2778）
function captureScreenshot() {
    console.log('🎨 正在生成赛程图片...');
    
    const statusElement = document.getElementById('refresh-status');
    const originalText = statusElement.innerHTML;
    statusElement.innerHTML = '🎨 正在生成赛程图片...';
    
    const matchesContainer = document.getElementById('matches-container');
    const activeTab = document.querySelector('.tab-btn.active');
    const tabName = activeTab ? activeTab.textContent.replace(/[📋⏭️✅📊🥅📍]/g, '').trim() : '赛程';
    
    // 获取所有比赛卡片
    const matchCards = matchesContainer.querySelectorAll('.match-card');
    
    if (matchCards.length === 0) {
        alert('当前没有可生成的赛程数据');
        statusElement.innerHTML = originalText;
        return;
    }
    
    // 按日期分组比赛
    const matchByDate = new Map();
    matchCards.forEach(card => {
        let dateTitle = '其他';
        let parent = card.parentElement;
        while (parent && parent !== matchesContainer) {
            const title = parent.querySelector('.date-title');
            if (title) {
                dateTitle = title.textContent.trim();
                break;
            }
            parent = parent.parentElement;
        }
        if (!matchByDate.has(dateTitle)) {
            matchByDate.set(dateTitle, []);
        }
        matchByDate.get(dateTitle).push(card);
    });
    
    let totalMatchCount = 0;
    matchByDate.forEach(cards => totalMatchCount += cards.length);
    
    // ============= 固定画布尺寸：iPhone 12 Pro Max (1284 x 2778) =============
    const canvasW = 1284;
    const canvasH = 2778;
    
    // ============= 标准尺寸参数（如果内容少，用这个尺寸绘制） =============
    const S = {
        padding: 60,
        titleHeight: 200,
        footerHeight: 80,
        matchCardHeight: 200,
        dateHeaderHeight: 70,
    };
    
    // ============= 估算标准总高度，判断是否需要缩放 =============
    const baseHeight = S.padding * 2 + S.titleHeight + S.footerHeight;
    const contentHeight = matchByDate.size * S.dateHeaderHeight + totalMatchCount * S.matchCardHeight;
    const estimatedTotal = baseHeight + contentHeight;
    const availableHeight = canvasH - S.padding * 2 - S.titleHeight - S.footerHeight;
    
    // 计算缩放比例：如果内容超出，就整体缩小；内容少则保持标准尺寸（不放大）
    let scale = 1.0;
    if (contentHeight > availableHeight) {
        scale = availableHeight / contentHeight;
    }
    
    // 应用缩放后的实际尺寸
    const padding = S.padding;
    const titleHeight = S.titleHeight;
    const footerHeight = S.footerHeight;
    const matchCardHeight = Math.max(70, Math.floor(S.matchCardHeight * scale));
    const dateHeaderHeight = Math.max(30, Math.floor(S.dateHeaderHeight * scale));
    
    // 字体大小随缩放调整（设定最小值，保证可读性）
    const titleFontSize = Math.floor(56 * Math.min(1, scale * 1.2));
    const subtitleFontSize = Math.floor(32 * Math.min(1, scale * 1.2));
    const metaFontSize = Math.max(14, Math.floor(22 * scale));
    const dateFontSize = Math.max(18, Math.floor(32 * scale));
    const badgeFontSize = Math.max(12, Math.floor(20 * scale));
    const teamFontSize = Math.max(16, Math.floor(28 * scale));
    const vsFontSize = Math.max(18, Math.floor(36 * scale));
    const timeFontSize = Math.max(12, Math.floor(22 * scale));
    const venueFontSize = Math.max(10, Math.floor(20 * scale));
    const footerFontSize = Math.max(14, Math.floor(22 * Math.min(1, scale * 1.2)));
    
    // 创建固定尺寸 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 绘制背景渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasH);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 绘制标题区域
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${titleFontSize}px Arial, sans-serif`;
    ctx.fillText('🏆 2026 美加墨世界杯', canvasW / 2, padding + titleFontSize + 10);
    
    ctx.shadowBlur = 0;
    ctx.font = `bold ${subtitleFontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(tabName, canvasW / 2, padding + titleFontSize + subtitleFontSize + 35);
    
    ctx.fillStyle = '#888';
    ctx.font = `${metaFontSize}px Arial, sans-serif`;
    ctx.fillText(`生成时间: ${new Date().toLocaleString('zh-CN')}  |  共 ${totalMatchCount} 场比赛`,
                 canvasW / 2, padding + titleFontSize + subtitleFontSize + metaFontSize + 70);
    
    // 绘制比赛内容
    let currentY = padding + titleHeight;
    
    matchByDate.forEach((cards, dateTitle) => {
        // 绘制日期标题
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${dateFontSize}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(dateTitle, padding, currentY + dateFontSize);
        
        // 绘制分割线
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padding, currentY + dateHeaderHeight - 10);
        ctx.lineTo(canvasW - padding, currentY + dateHeaderHeight - 10);
        ctx.stroke();
        
        currentY += dateHeaderHeight;
        
        // 绘制该日期的比赛
        cards.forEach((card) => {
            // 卡片背景
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            const cardX = padding;
            const cardY = currentY;
            const cardW = canvasW - padding * 2;
            const cardH = matchCardHeight - 8;
            
            // 圆角矩形
            const radius = Math.max(5, Math.floor(12 * scale));
            ctx.beginPath();
            ctx.moveTo(cardX + radius, cardY);
            ctx.lineTo(cardX + cardW - radius, cardY);
            ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
            ctx.lineTo(cardX + cardW, cardY + cardH - radius);
            ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
            ctx.lineTo(cardX + radius, cardY + cardH);
            ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
            ctx.lineTo(cardX, cardY + radius);
            ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
            ctx.closePath();
            ctx.fill();
            
            // 获取比赛信息
            const teams = card.querySelectorAll('.team .team-name');
            const time = card.querySelector('.time');
            const venue = card.querySelector('.venue');
            const matchBadge = card.querySelector('.match-badge');
            const matchStatus = card.querySelector('.match-status');
            
            const team1Name = teams[0]?.textContent.trim() || 'TBD';
            const team2Name = teams[1]?.textContent.trim() || 'TBD';
            
            // 徽章尺寸计算
            const badgeBoxW = Math.max(60, Math.floor(100 * scale));
            const badgeBoxH = Math.max(20, Math.floor(30 * scale));
            const badgeOffsetX = Math.max(50, Math.floor(80 * scale));
            const badgeOffsetY = Math.floor(badgeBoxH / 2 + 8);
            
            // 绘制轮次徽章（左上）
            if (matchBadge) {
                ctx.fillStyle = '#ffd700';
                const bx = cardX + badgeOffsetX;
                const by = cardY + badgeOffsetY;
                ctx.fillRect(bx - badgeBoxW / 2, by - badgeBoxH / 2, badgeBoxW, badgeBoxH);
                ctx.fillStyle = '#1a1a2e';
                ctx.font = `bold ${badgeFontSize}px Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(matchBadge.textContent.trim(), bx, by + badgeFontSize / 3);
            }
            
            // 绘制状态徽章（右上）
            if (matchStatus) {
                ctx.fillStyle = '#4caf50';
                const bx = cardX + cardW - badgeOffsetX;
                const by = cardY + badgeOffsetY;
                ctx.fillRect(bx - badgeBoxW / 2, by - badgeBoxH / 2, badgeBoxW, badgeBoxH);
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${badgeFontSize}px Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(matchStatus.textContent.trim(), bx, by + badgeFontSize / 3);
            }
            
            // 绘制球队名称 + VS（卡片中部）
            const centerY = cardY + cardH / 2 + badgeOffsetY / 2;
            ctx.font = `bold ${teamFontSize}px Arial, sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            
            // 球队名过长时截断
            const maxTeamChars = Math.floor(10 / Math.max(0.5, scale));
            const drawTeamName = (name, x) => {
                const display = name.length > maxTeamChars ? name.substring(0, maxTeamChars) + '…' : name;
                ctx.fillText(display, x, centerY);
            };
            
            drawTeamName(team1Name, cardX + cardW * 0.25);
            
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${vsFontSize}px Arial, sans-serif`;
            ctx.fillText('VS', cardX + cardW * 0.5, centerY + vsFontSize / 4);
            
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${teamFontSize}px Arial, sans-serif`;
            drawTeamName(team2Name, cardX + cardW * 0.75);
            
            // 绘制时间和场馆（卡片底部）
            const timeY = centerY + teamFontSize + Math.max(10, Math.floor(18 * scale));
            const venueY = timeY + timeFontSize + Math.max(4, Math.floor(8 * scale));
            
            if (time) {
                ctx.font = `${timeFontSize}px Arial, sans-serif`;
                ctx.fillStyle = '#aaa';
                ctx.textAlign = 'center';
                ctx.fillText(time.textContent.trim(), cardX + cardW * 0.5, timeY);
            }
            
            if (venue && venueY < cardY + cardH - 6) {
                ctx.font = `${venueFontSize}px Arial, sans-serif`;
                ctx.fillStyle = '#888';
                ctx.textAlign = 'center';
                let venueText = venue.textContent.trim();
                const maxVenueChars = Math.floor(30 / Math.max(0.5, scale));
                if (venueText.length > maxVenueChars) {
                    venueText = venueText.substring(0, maxVenueChars) + '…';
                }
                ctx.fillText(venueText, cardX + cardW * 0.5, venueY);
            }
            
            currentY += matchCardHeight;
        });
    });
    
    // 绘制底部
    ctx.fillStyle = '#666';
    ctx.font = `${footerFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚽ 2026 FIFA World Cup · USA / Canada / Mexico', canvasW / 2, canvasH - padding / 2);
    
    // 下载图片
    try {
        const link = document.createElement('a');
        link.download = `worldcup_${tabName}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        statusElement.innerHTML = originalText;
        console.log(`🎨 赛程图片已生成！尺寸 ${canvasW}x${canvasH}, 缩放比 ${scale.toFixed(2)}, 共 ${totalMatchCount} 场`);
    } catch (e) {
        console.error('图片下载失败:', e);
        statusElement.innerHTML = originalText;
        alert('图片生成失败: ' + e.message);
    }
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
