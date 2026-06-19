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
    if (match.status && match.status !== 'upcoming') return match.status;
    const now = new Date();
    const matchDate = new Date(match.date);
    const hs = match.homeScore !== undefined ? match.homeScore : match.home_score;
    const as = match.awayScore !== undefined ? match.awayScore : match.away_score;
    if (hs !== undefined && hs !== null && as !== undefined && as !== null) return 'finished';
    if (matchDate < now) return 'finished';
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

// wheniskickoff.com API 地址
const API_BASE = 'https://wheniskickoff.com/data/v1';

// football-data.org API（实时比分）
const FOOTBALL_API_KEY = '458e4345ec604c9aa396b970387aee56';
const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

// FIFA 代码到中文名映射
const FIFA_TO_CN = {
    "ARG": "阿根廷", "AUS": "澳大利亚", "AUT": "奥地利", "BEL": "比利时",
    "BIH": "波黑", "BRA": "巴西", "CAN": "加拿大", "CHE": "瑞士",
    "CHN": "中国", "COL": "哥伦比亚", "CRI": "佛得角", "CZE": "捷克",
    "DEN": "丹麦", "DZA": "阿尔及利亚", "ECU": "厄瓜多尔", "ENG": "英格兰",
    "ESP": "西班牙", "FRA": "法国", "GER": "德国", "GHA": "加纳",
    "GRE": "希腊", "HRV": "克罗地亚", "IRN": "伊朗", "IRQ": "伊拉克",
    "ITA": "意大利", "JOR": "约旦", "JPN": "日本", "KOR": "韩国",
    "MAR": "摩洛哥", "MEX": "墨西哥", "NED": "荷兰", "NGA": "尼日利亚",
    "NOR": "挪威", "NZL": "新西兰", "PAR": "巴拉圭", "PER": "秘鲁",
    "POL": "波兰", "POR": "葡萄牙", "QAT": "卡塔尔", "RSA": "南非",
    "RUS": "俄罗斯", "SAU": "沙特阿拉伯", "SEN": "塞内加尔", "SRB": "塞尔维亚",
    "SUI": "瑞士", "SVK": "斯洛伐克", "SWE": "瑞典", "TUR": "土耳其",
    "URU": "乌拉圭", "USA": "美国", "VEN": "委内瑞拉", "CIV": "科特迪瓦",
    "PAN": "巴拿马", "COD": "民主刚果", "UZB": "乌兹别克斯坦",
    "TUN": "突尼斯", "EGY": "埃及", "CRO": "克罗地亚", "SCO": "苏格兰",
    "HAI": "海地", "CUW": "库拉索", "KSA": "沙特阿拉伯", "MOR": "摩洛哥"
};

// FIFA 代码到 ISO 代码映射
const FIFA_TO_ISO = {
    "ARG": "ar", "AUS": "au", "AUT": "at", "BEL": "be", "BIH": "ba",
    "BRA": "br", "CAN": "ca", "CHE": "ch", "CHN": "cn", "COL": "co",
    "CRI": "cv", "CZE": "cz", "DEN": "dk", "DZA": "dz", "ECU": "ec",
    "ENG": "gb-eng", "ESP": "es", "FRA": "fr", "GER": "de", "GHA": "gh",
    "GRE": "gr", "HRV": "hr", "IRN": "ir", "IRQ": "iq", "ITA": "it",
    "JOR": "jo", "JPN": "jp", "KOR": "kr", "MAR": "ma", "MEX": "mx",
    "NED": "nl", "NGA": "ng", "NOR": "no", "NZL": "nz", "PAR": "py",
    "PER": "pe", "POL": "pl", "POR": "pt", "QAT": "qa", "RSA": "za",
    "RUS": "ru", "SAU": "sa", "SEN": "sn", "SRB": "rs", "SUI": "ch",
    "SVK": "sk", "SWE": "se", "TUR": "tr", "URU": "uy", "USA": "us",
    "VEN": "ve", "CIV": "ci", "PAN": "pa", "COD": "cd", "UZB": "uz",
    "TUN": "tn", "EGY": "eg", "CRO": "hr", "SCO": "gb-sct", "HAI": "ht",
    "CUW": "cw", "KSA": "sa", "MOR": "ma"
};

// 从 football-data.org 获取实时比分
async function fetchFootballDataScores() {
    try {
        console.log('正在从 football-data.org 获取实时比分...');
        
        const headers = {
            'X-Auth-Token': FOOTBALL_API_KEY
        };
        
        const response = await fetch(`${FOOTBALL_API_BASE}/competitions/WC/matches`, { headers });
        if (!response.ok) {
            console.log('football-data.org API 请求失败');
            return {};
        }
        
        const data = await response.json();
        const scores = {};
        
        // 遍历比赛数据，提取比分
        (data.matches || []).forEach(match => {
            const homeTla = match.homeTeam?.tla || '';
            const awayTla = match.awayTeam?.tla || '';
            const matchDate = match.utcDate?.split('T')[0] || '';
            const key = `${homeTla}-${awayTla}`;
            
            // 转换状态
            let status = 'upcoming';
            if (match.status === 'FINISHED') {
                status = 'finished';
            } else if (match.status === 'LIVE' || match.status === 'IN_PLAY') {
                status = 'live';
            }
            
            scores[key] = {
                home_score: match.score?.fullTime?.home ?? null,
                away_score: match.score?.fullTime?.away ?? null,
                status: status,
                minute: match.minute || null
            };
        });
        
        console.log(`✓ 获取到 ${Object.keys(scores).length} 场比赛比分`);
        return scores;
        
    } catch (err) {
        console.error('football-data.org 获取失败:', err);
        return {};
    }
}

// 从 wheniskickoff.com API 获取最新数据
async function fetchLiveData() {
    try {
        console.log('正在从 wheniskickoff.com 获取最新数据...');
        
        const [matchesRes, teamsRes] = await Promise.all([
            fetch(`${API_BASE}/matches.json`),
            fetch(`${API_BASE}/teams.json`)
        ]);
        
        if (!matchesRes.ok || !teamsRes.ok) {
            throw new Error('API 请求失败');
        }
        
        const matchesData = await matchesRes.json();
        const teamsData = await teamsRes.json();
        
        const matchesRaw = matchesData.data || matchesData;
        const teamsRaw = teamsData.data || teamsData;
        
        // 同时获取 football-data.org 的实时比分
        const liveScores = await fetchFootballDataScores();
        
        // 合并比分数据
        if (Object.keys(liveScores).length > 0) {
            matchesRaw.forEach(m => {
                const homeCode = m.home || '';
                const awayCode = m.away || '';
                const key = `${homeCode}-${awayCode}`;
                
                if (liveScores[key]) {
                    m.homeScore = liveScores[key].home_score;
                    m.awayScore = liveScores[key].away_score;
                    m.status = liveScores[key].status;
                }
            });
        }
        
        // 转换数据格式
        const teamsMap = {};
        teamsRaw.forEach(t => {
            teamsMap[t.code] = t;
        });
        
        const matches = matchesRaw.map(m => {
            const homeCode = m.home || '';
            const awayCode = m.away || '';
            const homeTeam = teamsMap[homeCode] || {};
            const awayTeam = teamsMap[awayCode] || {};
            
            return {
                id: m.num || m.id || 0,
                date: m.datetime_utc || m.date || '',
                group: m.group || '',
                matchday: m.matchday || 1,
                round: m.phase === 'group' ? '小组赛' : '淘汰赛',
                phase: m.phase || 'group',
                home: {
                    name: FIFA_TO_CN[homeCode] || homeTeam.name || homeCode,
                    code: homeCode,
                    flag: homeTeam.flag || '',
                    iso: FIFA_TO_ISO[homeCode] || (homeCode ? homeCode.toLowerCase().substring(0, 2) : '')
                },
                away: {
                    name: FIFA_TO_CN[awayCode] || awayTeam.name || awayCode,
                    code: awayCode,
                    flag: awayTeam.flag || '',
                    iso: FIFA_TO_ISO[awayCode] || (awayCode ? awayCode.toLowerCase().substring(0, 2) : '')
                },
                venue: m.venue_name || '',
                city: m.venue_city || '',
                venue_code: m.venue || '',
                status: m.status || 'upcoming',
                homeScore: m.homeScore !== undefined ? m.homeScore : (m.home_score !== undefined ? m.home_score : null),
                awayScore: m.awayScore !== undefined ? m.awayScore : (m.away_score !== undefined ? m.away_score : null),
                slug: m.slug || ''
            };
        });
        
        console.log(`✓ 获取到 ${matches.length} 场比赛`);
        return { matches, lastUpdated: new Date().toISOString() };
        
    } catch (err) {
        console.error('API 获取失败:', err);
        return null;
    }
}

// 显示数据更新提示
let updateNotification = null;
function showUpdateNotification(message, type = 'info') {
    // 移除现有提示
    if (updateNotification) {
        updateNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `update-notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${type === 'success' ? '✓' : '🔄'}</span>
        <span class="notification-text">${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    updateNotification = notification;
    
    // 3秒后自动移除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// 自动更新数据（每5分钟）
let autoUpdateInterval = null;
async function startAutoUpdate() {
    // 每30分钟自动更新比分
    if (autoUpdateInterval) clearInterval(autoUpdateInterval);
    autoUpdateInterval = setInterval(async () => {
        console.log('自动检查比分更新...');
        // 重新加载数据（自动更新比分
        try {
            // 只尝试从 football-data.org 获取最新比分
            const scoreRes = await fetch(`${FOOTBALL_API_BASE}/competitions/WC/matches`, {
                headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
            });
            if (scoreRes.ok) {
                const scoreData = await scoreRes.json();
                const liveScores = {};
                (scoreData.matches || []).forEach(m => {
                    const homeTla = m.homeTeam?.tla || '';
                    const awayTla = m.awayTeam?.tla || '';
                    const key = `${homeTla}-${awayTla}`;
                    let status = 'upcoming';
                    if (m.status === 'FINISHED') status = 'finished';
                    else if (m.status === 'LIVE' || m.status === 'IN_PLAY') status = 'live';
                    const hs = m.score?.fullTime?.home;
                    const as = m.score?.fullTime?.away;
                    if (hs !== undefined && hs !== null) {
                        liveScores[key] = { homeScore: hs, awayScore: as, status };
                    }
                });
                
                // 更新现有比赛
                let updated = 0;
                allMatches.forEach(match => {
                    const key = `${match.home.code}-${match.away.code}`;
                    if (liveScores[key]) {
                        if (match.homeScore !== liveScores[key].homeScore || 
                            match.awayScore !== liveScores[key].awayScore ||
                            match.status !== liveScores[key].status) {
                            match.homeScore = liveScores[key].homeScore;
                            match.awayScore = liveScores[key].awayScore;
                            match.status = liveScores[key].status;
                            updated++;
                        }
                    }
                });
                
                const scoreCount = allMatches.filter(m => hasValidScore(m)).length;
                document.getElementById('last-updated').textContent = 
                    `${new Date().toLocaleString('zh-CN')} (已更新 ${scoreCount} 场比分)`;
                renderAll();
                if (updated > 0) {
                    showUpdateNotification(`比分自动更新成功！更新 ${updated} 场比赛`, 'success');
                }
            }
        } catch (e) {
            console.log('自动更新失败:', e);
        }
    }, 30 * 60 * 1000); // 30分钟
}

// 统一比名字段名：将 home_score/away_score 转换为 homeScore/awayScore
function normalizeMatch(match) {
    if (!match) return match;
    if (match.home_score !== undefined && match.homeScore === undefined) {
        match.homeScore = match.home_score;
    }
    if (match.away_score !== undefined && match.awayScore === undefined) {
        match.awayScore = match.away_score;
    }
    return match;
}

// 判断是否有有效比分
function hasValidScore(match) {
    if (!match) return false;
    const hs = match.homeScore !== undefined ? match.homeScore : match.home_score;
    const as = match.awayScore !== undefined ? match.awayScore : match.away_score;
    return hs !== undefined && hs !== null && as !== undefined && as !== null;
}

async function loadData() {
    try {
        console.log('开始加载数据...');
        
        // 优先加载本地 matches.json（确保页面能正常显示）
        let localData = null;
        try {
            const res = await fetch('matches.json');
            if (res.ok) {
                localData = await res.json();
                console.log(`✓ 本地 matches.json 加载成功，共 ${localData.matches?.length || 0} 场比赛`);
            }
        } catch (e) {
            console.error('本地 matches.json 加载失败:', e);
            document.getElementById('matches-container').innerHTML =
                `<div class="loading">
                    <p>⚠️ 本地数据加载失败</p>
                    <p style="font-size:0.85rem;margin-top:8px;color:#b0bec5;">请确保 matches.json 文件存在</p>
                </div>`;
            return;
        }
        
        // 从本地数据初始化基础数据
        allMatches = localData.matches || [];
        allTeams = localData.teams || {};
        topScorers = localData.topScorers || [];
        window.topScorersData = topScorers;
        if (localData.flagCdn) flagCdnBase = localData.flagCdn;
        
        // 立即渲染页面（使用本地数据）
        const scoreCount = allMatches.filter(m => hasValidScore(m)).length;
        document.getElementById('last-updated').textContent = 
            `${new Date().toLocaleString('zh-CN')} (本地数据: ${scoreCount} 场有比分)`;
        
        initPage();
        console.log(`✓ 使用本地数据渲染完成，共 ${allMatches.length} 场比赛`);
        
        // 启动自动更新（后台异步更新比分）
        startAutoUpdate();
        
        // 后台尝试获取最新比分（不阻塞页面渲染）
        fetchAndUpdateScores();
        
    } catch (err) {
        console.error('数据加载失败：', err);
        document.getElementById('matches-container').innerHTML =
            `<div class="loading">
                <p>⚠️ 数据加载失败</p>
                <p style="font-size:0.85rem;margin-top:8px;color:#b0bec5;">${err.message}</p>
            </div>`;
    }
}

// 后台异步获取并更新比分
async function fetchAndUpdateScores() {
    try {
        console.log('后台获取最新比分...');
        
        // 尝试从 football-data.org 获取比分
        let liveScores = {};
        try {
            const scoreRes = await fetch(`${FOOTBALL_API_BASE}/competitions/WC/matches`, {
                headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
                timeout: 10000
            });
            if (scoreRes.ok) {
                const scoreData = await scoreRes.json();
                (scoreData.matches || []).forEach(m => {
                    const homeTla = m.homeTeam?.tla || '';
                    const awayTla = m.awayTeam?.tla || '';
                    const key = `${homeTla}-${awayTla}`;
                    let status = 'upcoming';
                    if (m.status === 'FINISHED') status = 'finished';
                    else if (m.status === 'LIVE' || m.status === 'IN_PLAY') status = 'live';
                    const hs = m.score?.fullTime?.home;
                    const as = m.score?.fullTime?.away;
                    if (hs !== undefined && hs !== null) {
                        liveScores[key] = { homeScore: hs, awayScore: as, status };
                    }
                });
                console.log(`✓ football-data.org 获取到 ${Object.keys(liveScores).length} 场比分`);
            } else {
                console.log(`football-data.org 返回 ${scoreRes.status}`);
            }
        } catch (e) {
            console.log('football-data.org 获取失败:', e);
        }
        
        // 更新比分
        let updated = 0;
        allMatches.forEach(match => {
            const key = `${match.home.code}-${match.away.code}`;
            if (liveScores[key]) {
                if (match.homeScore !== liveScores[key].homeScore || 
                    match.awayScore !== liveScores[key].awayScore) {
                    match.homeScore = liveScores[key].homeScore;
                    match.awayScore = liveScores[key].awayScore;
                    match.status = liveScores[key].status;
                    updated++;
                }
            }
        });
        
        if (updated > 0) {
            const scoreCount = allMatches.filter(m => hasValidScore(m)).length;
            document.getElementById('last-updated').textContent = 
                `${new Date().toLocaleString('zh-CN')} (已更新 ${scoreCount} 场比分)`;
            renderAll();
            showUpdateNotification(`比分更新成功！新增 ${updated} 场比赛`, 'success');
        }
        
    } catch (e) {
        console.log('后台更新比分失败:', e);
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
    const hs = match.homeScore !== undefined ? match.homeScore : match.home_score;
    const as = match.awayScore !== undefined ? match.awayScore : match.away_score;
    const hasScore = (status === 'finished' || status === 'live') && hs !== null && hs !== undefined;
    let homeWinner = false, awayWinner = false;
    if (hasScore) {
        if (hs > as) homeWinner = true;
        else if (as > hs) awayWinner = true;
    }

    const scoreHtml = hasScore
        ? `<div class="match-score">
             <span class="${homeWinner ? 'winner' : ''}">${hs}</span>
             <small>-</small>
             <span class="${awayWinner ? 'winner' : ''}">${as}</span>
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
    // 行业标准排名：进球数 → 助攻数 → 出场次数（少优先）→ 名字
    const sorted = [...topScorers].sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        if (a.matches !== b.matches) return a.matches - b.matches;
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
    
    // 内容类型切换时显示/隐藏对应的设置
    const contentRadios = document.querySelectorAll('input[name="content-type"]');
    contentRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const dateSection = document.getElementById('date-section');
            const stageSection = document.getElementById('stage-section');
            const colsSection = document.getElementById('cols-section');
            // 列数始终显示，日期和阶段只在赛程时显示
            colsSection.style.display = 'block';
            if (this.value === 'matches') {
                dateSection.style.display = 'block';
                stageSection.style.display = 'block';
            } else {
                dateSection.style.display = 'none';
                stageSection.style.display = 'none';
            }
        });
    });
    
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
    const contentType = document.querySelector('input[name="content-type"]:checked').value;
    return {
        contentType: contentType,
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
    const settings = getScreenshotSettings();
    
    if (!allMatches || allMatches.length === 0) {
        alert('暂无数据');
        return;
    }
    
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '<div class="preview-placeholder">正在生成预览...</div>';
    
    // 根据内容类型生成不同图片
    if (settings.contentType === 'matches') {
        generateMatchesPreview(settings);
    } else if (settings.contentType === 'standings') {
        generateStandingsPreview(settings);
    } else if (settings.contentType === 'scorers') {
        generateScorersPreview(settings);
    }
}

// 生成赛程预览
function generateMatchesPreview(settings) {
    const matches = filterMatchesForScreenshot(settings);
    
    if (matches.length === 0) {
        alert('当前筛选条件下没有比赛');
        document.getElementById('preview-container').innerHTML = '<div class="preview-placeholder">当前筛选条件下没有比赛</div>';
        return;
    }
    
    // 收集国旗
    const isoCodes = new Set();
    matches.forEach(m => {
        if (m.home && m.home.iso) isoCodes.add(m.home.iso);
        if (m.away && m.away.iso) isoCodes.add(m.away.iso);
    });
    
    loadFlags(isoCodes).then(() => {
        screenshotCanvas = generateScheduleImage(matches, settings.cols, settings.stage);
        document.getElementById('preview-container').innerHTML = '';
        document.getElementById('preview-container').appendChild(screenshotCanvas);
        console.log(`预览生成完成！${matches.length} 场比赛，${settings.cols} 列布局`);
    });
}

// 生成积分榜预览
function generateStandingsPreview(settings) {
    // 获取积分榜数据
    const standings = getStandingsData();
    
    if (!standings || standings.length === 0) {
        alert('暂无积分榜数据');
        document.getElementById('preview-container').innerHTML = '<div class="preview-placeholder">暂无积分榜数据</div>';
        return;
    }
    
    // 收集国旗
    const isoCodes = new Set();
    standings.forEach(group => {
        group.teams.forEach(team => {
            if (team.iso) isoCodes.add(team.iso);
        });
    });
    
    const cols = settings.cols || 2;
    
    loadFlags(isoCodes).then(() => {
        screenshotCanvas = generateStandingsImage(standings, cols);
        document.getElementById('preview-container').innerHTML = '';
        const previewImg = screenshotCanvas;
        previewImg.style.maxWidth = '100%';
        previewImg.style.height = 'auto';
        previewImg.style.maxHeight = '700px';
        document.getElementById('preview-container').appendChild(previewImg);
        console.log(`积分榜预览生成完成！${standings.length} 个小组, ${cols} 列`);
    });
}

// 生成射手榜预览
function generateScorersPreview(settings) {
    // 获取射手榜数据
    const scorers = getScorersData();
    
    if (!scorers || scorers.length === 0) {
        alert('暂无射手榜数据');
        document.getElementById('preview-container').innerHTML = '<div class="preview-placeholder">暂无射手榜数据</div>';
        return;
    }
    
    // 收集国旗
    const isoCodes = new Set();
    scorers.forEach(scorer => {
        if (scorer.team && scorer.team.iso) isoCodes.add(scorer.team.iso);
    });
    
    const cols = settings.cols || 2;
    
    loadFlags(isoCodes).then(() => {
        screenshotCanvas = generateScorersImage(scorers, cols);
        document.getElementById('preview-container').innerHTML = '';
        const previewImg = screenshotCanvas;
        previewImg.style.maxWidth = '100%';
        previewImg.style.height = 'auto';
        previewImg.style.maxHeight = '700px';
        document.getElementById('preview-container').appendChild(previewImg);
        console.log(`射手榜预览生成完成！${scorers.length} 名球员, ${cols} 列`);
    });
}

// 从数据中获取积分榜
function getStandingsData() {
    // 动态获取所有小组名
    const groupSet = new Set();
    allMatches.forEach(m => { if (m.group) groupSet.add(m.group); });
    const groups = Array.from(groupSet).sort();
    const standings = [];
    
    groups.forEach(groupName => {
        const groupMatches = allMatches.filter(m => m.group === groupName);
        const teamStats = {};
        
        // 初始化球队数据
        groupMatches.forEach(m => {
            if (m.home && m.home.iso) {
                if (!teamStats[m.home.iso]) {
                    teamStats[m.home.iso] = { 
                        name: m.home.name, 
                        iso: m.home.iso,
                        games: 0, wins: 0, draws: 0, losses: 0, points: 0, gf: 0, ga: 0 
                    };
                }
            }
            if (m.away && m.away.iso) {
                if (!teamStats[m.away.iso]) {
                    teamStats[m.away.iso] = { 
                        name: m.away.name, 
                        iso: m.away.iso,
                        games: 0, wins: 0, draws: 0, losses: 0, points: 0, gf: 0, ga: 0 
                    };
                }
            }
        });
        
        // 统计比赛结果
        groupMatches.forEach(m => {
            const hs = m.homeScore !== undefined ? m.homeScore : m.home_score;
            const as = m.awayScore !== undefined ? m.awayScore : m.away_score;
            if (m.status !== 'finished' || hs === null || hs === undefined || as === null || as === undefined) return;
            
            const home = teamStats[m.home.iso];
            const away = teamStats[m.away.iso];
            if (!home || !away) return;
            
            home.games++;
            away.games++;
            home.gf += hs;
            home.ga += as;
            away.gf += as;
            away.ga += hs;
            
            if (hs > as) {
                home.wins++;
                home.points += 3;
                away.losses++;
            } else if (hs < as) {
                away.wins++;
                away.points += 3;
                home.losses++;
            } else {
                home.draws++;
                away.draws++;
                home.points++;
                away.points++;
            }
        });
        
        // 排序
        const teams = Object.values(teamStats).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if ((b.gf - b.ga) !== (a.gf - a.ga)) return (b.gf - b.ga) - (a.gf - a.ga);
            return b.gf - a.gf;
        });
        
        standings.push({ name: groupName, teams });
    });
    
    return standings;
}

// 从数据中获取射手榜
function getScorersData() {
    // 检查是否有射手榜数据（从 matches.json 的 topScorers 字段）
    if (window.topScorersData && window.topScorersData.length > 0) {
        return window.topScorersData.map(s => ({
            name: s.name,
            goals: s.goals,
            assists: s.assists,
            team: { 
                name: s.team, 
                iso: s.team_iso 
            }
        }));
    }
    
    // 从 matches.json 的 scorers 字段获取
    const scorersMap = {};
    allMatches.forEach(m => {
        if (m.scorers && Array.isArray(m.scorers)) {
            m.scorers.forEach(s => {
                const key = s.name;
                if (!scorersMap[key]) {
                    scorersMap[key] = {
                        name: s.name,
                        goals: 0,
                        assists: s.assists || 0,
                        team: { name: s.team, iso: s.team_iso }
                    };
                }
                scorersMap[key].goals += s.goals || 1;
            });
        }
    });
    
    return Object.values(scorersMap).sort((a, b) => b.goals - a.goals);
}

// 加载国旗图片
function loadFlags(isoCodes) {
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
    
    return Promise.all(loadPromises);
}

// 生成积分榜图片（真正自适应：内容少就放大，内容多才缩小）
function generateStandingsImage(standings, cols = 2) {
    const canvasW = 1320;
    const canvasH = 2868;
    const padding = 45;
    
    // 第一步：先用基准尺寸计算内容总高度
    const baseRowH = 60;           // 基准球队行高
    const baseHeaderH = 45;        // 基准表头高度
    const baseGroupTitleH = 35;    // 基准组标题高度
    const groupGap = 25;           // 组间距
    const baseFontSize = 16;
    
    let totalRows = 0;
    let totalGroups = standings.length;
    standings.forEach(g => totalRows += g.teams.length);
    
    // 按列数计算总行数（每列的行数）
    const maxRowsPerCol = Math.ceil(totalGroups / cols) * (1 + 1) + totalRows; // 组标题 + 表头 + 球队行
    
    // 基准状态下的内容高度（不包括标题区、底部）
    let baseContentH = 0;
    for (let col = 0; col < cols; col++) {
        let colH = 0;
        for (let i = col; i < standings.length; i += cols) {
            colH += baseGroupTitleH + baseHeaderH + standings[i].teams.length * baseRowH + groupGap;
        }
        baseContentH = Math.max(baseContentH, colH);
    }
    
    // 标题和底部高度（也会随缩放变化）
    const baseTitleH = 200;
    const baseFooterH = 40;
    const totalBaseH = baseTitleH + baseContentH + baseFooterH;
    const availableH = canvasH - padding * 2;
    
    // 第二步：计算缩放比例 —— 关键：内容少时 scale > 1 放大
    let scale = availableH / totalBaseH;
    // 限制最大放大到 1.5 倍，最小 0.4 倍
    scale = Math.min(1.5, Math.max(0.4, scale));
    
    // 实际尺寸
    const rowH = Math.floor(baseRowH * scale);
    const headerH = Math.floor(baseHeaderH * scale);
    const groupTitleH = Math.floor(baseGroupTitleH * scale);
    const titleH = Math.floor(baseTitleH * scale);
    const footerH = Math.floor(baseFooterH * scale);
    const fontSize = Math.max(10, Math.floor(baseFontSize * scale));
    const groupTitleFont = Math.max(14, Math.floor(22 * scale));
    const titleFont = Math.max(24, Math.floor(52 * scale));
    const subtitleFont = Math.max(16, Math.floor(26 * scale));
    const smallFont = Math.max(10, Math.floor(14 * scale));
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, '#0a0e27');
    grad.addColorStop(0.5, '#16204a');
    grad.addColorStop(1, '#0a0e27');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 金色边框
    ctx.strokeStyle = 'rgba(255,215,0,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding - 8, padding - 8, canvasW - padding * 2 + 16, canvasH - padding * 2 + 16);
    
    // 标题区
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${titleFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText('🏆 2026 美加墨世界杯', canvasW / 2, padding + titleFont);
    
    ctx.shadowBlur = 0;
    ctx.font = `bold ${subtitleFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText('📊 积分榜', canvasW / 2, padding + titleFont + subtitleFont + 20);
    
    ctx.fillStyle = '#8899bb';
    ctx.font = `${smallFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText(`更新: ${new Date().toLocaleString('zh-CN')}`, canvasW / 2, padding + titleFont + subtitleFont + 20 + smallFont + 15);
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvasW * 0.1, padding + titleH - 10);
    ctx.lineTo(canvasW * 0.9, padding + titleH - 10);
    ctx.stroke();
    
    // 列宽
    const colW = (canvasW - padding * 2 - (cols - 1) * 15) / cols;
    const startY = padding + titleH;
    
    // 绘制各列
    for (let col = 0; col < cols; col++) {
        const colX = padding + col * (colW + 15);
        let y = startY;
        
        for (let i = col; i < standings.length; i += cols) {
            const group = standings[i];
            
            // 组标题（金色背景条）
            ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
            ctx.fillRect(colX, y, colW, groupTitleH);
            
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${groupTitleFont}px "Microsoft YaHei", Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(`${group.name}组`, colX + 10, y + groupTitleH * 0.68);
            
            y += groupTitleH;
            
            // 表头（深色背景）
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(colX, y, colW, headerH);
            
            ctx.fillStyle = '#99aabb';
            ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('#', colX + colW * 0.05, y + headerH * 0.65);
            ctx.textAlign = 'left';
            ctx.fillText('球队', colX + colW * 0.1, y + headerH * 0.65);
            ctx.textAlign = 'center';
            ctx.fillText('赛', colX + colW * 0.55, y + headerH * 0.65);
            ctx.fillText('胜', colX + colW * 0.65, y + headerH * 0.65);
            ctx.fillText('平', colX + colW * 0.73, y + headerH * 0.65);
            ctx.fillText('负', colX + colW * 0.81, y + headerH * 0.65);
            ctx.fillText('分', colX + colW * 0.92, y + headerH * 0.65);
            
            y += headerH;
            
            // 球队行
            group.teams.forEach((team, idx) => {
                // 交替背景
                ctx.fillStyle = idx % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)';
                ctx.fillRect(colX, y, colW, rowH);
                
                // 排名
                ctx.fillStyle = idx === 0 ? '#ffd700' : '#8899aa';
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(String(idx + 1), colX + colW * 0.05, y + rowH * 0.65);
                
                // 国旗
                const flagW = Math.floor(rowH * 1.4);
                const flagH = rowH - 10;
                const flagY = y + 5;
                const flagX = colX + colW * 0.1 + 5;
                if (team.iso && screenshotFlagImages[team.iso]) {
                    ctx.drawImage(screenshotFlagImages[team.iso], flagX, flagY, flagW, flagH);
                }
                
                // 队名（截断）
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
                ctx.textAlign = 'left';
                let name = team.name || '未知';
                const maxNameW = colW * 0.3;
                while (ctx.measureText(name).width > maxNameW && name.length > 1) {
                    name = name.slice(0, -1);
                }
                if (name !== team.name) name += '…';
                ctx.fillText(name, flagX + flagW + 8, y + rowH * 0.65);
                
                // 数据列
                ctx.fillStyle = '#ccddee';
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(String(team.games || 0), colX + colW * 0.55, y + rowH * 0.65);
                ctx.fillText(String(team.wins || 0), colX + colW * 0.65, y + rowH * 0.65);
                ctx.fillText(String(team.draws || 0), colX + colW * 0.73, y + rowH * 0.65);
                ctx.fillText(String(team.losses || 0), colX + colW * 0.81, y + rowH * 0.65);
                
                // 积分（金色大字）
                ctx.fillStyle = '#ffd700';
                ctx.font = `bold ${Math.floor(fontSize * 1.2)}px Arial`;
                ctx.fillText(String(team.points || 0), colX + colW * 0.92, y + rowH * 0.65);
                
                y += rowH;
            });
            
            y += groupGap;
        }
    }
    
    // 底部
    ctx.fillStyle = '#667799';
    ctx.font = `${smallFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚽ 2026 FIFA World Cup · USA / Canada / Mexico', canvasW / 2, canvasH - padding / 2);
    
    return canvas;
}

// 生成射手榜图片（真正自适应：内容少就放大，内容多才缩小）
function generateScorersImage(scorers, cols = 2) {
    const canvasW = 1320;
    const canvasH = 2868;
    const padding = 45;
    
    // 第一步：基准尺寸
    const baseRowH = 65;           // 基准行高
    const baseHeaderH = 50;        // 基准表头高度
    const baseFontSize = 16;
    
    // 按列数计算每列的行数
    const rowsPerCol = Math.ceil(scorers.length / cols);
    
    // 基准状态下内容总高度
    const baseTitleH = 200;
    const baseFooterH = 40;
    const baseContentH = baseHeaderH + rowsPerCol * baseRowH;
    const totalBaseH = baseTitleH + baseContentH + baseFooterH;
    const availableH = canvasH - padding * 2;
    
    // 第二步：计算缩放比例 —— 关键：内容少时 scale > 1 放大
    let scale = availableH / totalBaseH;
    scale = Math.min(1.5, Math.max(0.4, scale));
    
    // 实际尺寸
    const rowH = Math.floor(baseRowH * scale);
    const headerH = Math.floor(baseHeaderH * scale);
    const titleH = Math.floor(baseTitleH * scale);
    const fontSize = Math.max(10, Math.floor(baseFontSize * scale));
    const titleFont = Math.max(24, Math.floor(52 * scale));
    const subtitleFont = Math.max(16, Math.floor(26 * scale));
    const smallFont = Math.max(10, Math.floor(14 * scale));
    const goalsFont = Math.max(14, Math.floor(24 * scale));
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
    grad.addColorStop(0, '#0a0e27');
    grad.addColorStop(0.5, '#16204a');
    grad.addColorStop(1, '#0a0e27');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 金色边框
    ctx.strokeStyle = 'rgba(255,215,0,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding - 8, padding - 8, canvasW - padding * 2 + 16, canvasH - padding * 2 + 16);
    
    // 标题
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${titleFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText('🏆 2026 美加墨世界杯', canvasW / 2, padding + titleFont);
    
    ctx.shadowBlur = 0;
    ctx.font = `bold ${subtitleFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText('🥅 射手榜', canvasW / 2, padding + titleFont + subtitleFont + 20);
    
    ctx.fillStyle = '#8899bb';
    ctx.font = `${smallFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText(`更新: ${new Date().toLocaleString('zh-CN')} | 共 ${scorers.length} 人`, canvasW / 2, padding + titleFont + subtitleFont + 20 + smallFont + 15);
    
    // 分隔线
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvasW * 0.1, padding + titleH - 10);
    ctx.lineTo(canvasW * 0.9, padding + titleH - 10);
    ctx.stroke();
    
    // 列宽
    const colW = (canvasW - padding * 2 - (cols - 1) * 15) / cols;
    const startY = padding + titleH;
    
    // 绘制各列
    for (let col = 0; col < cols; col++) {
        const colX = padding + col * (colW + 15);
        let y = startY;
        
        // 表头（深色背景）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(colX, y, colW, headerH);
        
        ctx.fillStyle = '#99aabb';
        ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('#', colX + colW * 0.05, y + headerH * 0.65);
        ctx.textAlign = 'left';
        ctx.fillText('球员', colX + colW * 0.1, y + headerH * 0.65);
        ctx.textAlign = 'center';
        ctx.fillText('球队', colX + colW * 0.4, y + headerH * 0.65);
        ctx.fillText('进球', colX + colW * 0.6, y + headerH * 0.65);
        ctx.fillText('助攻', colX + colW * 0.73, y + headerH * 0.65);
        
        y += headerH;
        
        // 数据行
        for (let i = col; i < scorers.length; i += cols) {
            const scorer = scorers[i];
            
            // 交替背景
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)';
            ctx.fillRect(colX, y, colW, rowH);
            
            // 排名（前三名金银铜色）
            const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
            ctx.fillStyle = i < 3 ? rankColors[i] : '#8899aa';
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(String(i + 1), colX + colW * 0.05, y + rowH * 0.65);
            
            // 球员名（截断）
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
            ctx.textAlign = 'left';
            let name = scorer.name || '未知';
            const maxNameW = colW * 0.25;
            while (ctx.measureText(name).width > maxNameW && name.length > 1) {
                name = name.slice(0, -1);
            }
            if (name !== scorer.name) name += '…';
            ctx.fillText(name, colX + colW * 0.1, y + rowH * 0.65);
            
            // 国旗
            const flagW = Math.floor(rowH * 1.4);
            const flagH = rowH - 10;
            if (scorer.team && scorer.team.iso && screenshotFlagImages[scorer.team.iso]) {
                const flagX = colX + colW * 0.4 - flagW / 2;
                ctx.drawImage(screenshotFlagImages[scorer.team.iso], flagX, y + 5, flagW, flagH);
            }
            
            // 进球数（金色大字）
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${goalsFont}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(String(scorer.goals || 0), colX + colW * 0.6, y + rowH * 0.65);
            
            // 助攻数
            ctx.fillStyle = '#aabbcc';
            ctx.font = `${fontSize}px Arial`;
            ctx.fillText(String(scorer.assists || 0), colX + colW * 0.73, y + rowH * 0.65);
            
            // 球队名（右侧）
            ctx.fillStyle = '#aabbcc';
            ctx.font = `${fontSize - 1}px "Microsoft YaHei", Arial, sans-serif`;
            ctx.textAlign = 'right';
            let teamName = scorer.team ? (scorer.team.name || '未知') : '未知';
            const maxTeamW = colW * 0.2;
            while (ctx.measureText(teamName).width > maxTeamW && teamName.length > 1) {
                teamName = teamName.slice(0, -1);
            }
            if (teamName !== (scorer.team && scorer.team.name)) teamName += '…';
            ctx.fillText(teamName, colX + colW - 8, y + rowH * 0.65);
            
            y += rowH;
        }
    }
    
    // 底部
    ctx.fillStyle = '#667799';
    ctx.font = `${smallFont}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚽ 2026 FIFA World Cup · USA / Canada / Mexico', canvasW / 2, canvasH - padding / 2);
    
    return canvas;
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
    
    // 设置最小/最大卡片高度（内容少时放大，内容多时缩小）
    if (cardH < 80) cardH = 80;
    if (dateHeaderH < 30) dateHeaderH = 30;
    if (cardH > 400) cardH = 400;  // 最大400，避免内容太少时过度放大
    
    // ============ 字体大小（根据卡片高度动态缩放，支持放大和缩小） ============
    // 基准：cardH = 200 时使用以下字体大小；cardH > 200 时放大，cardH < 200 时缩小
    const fontScale = cardH / 200;
    
    const titleFont = Math.max(20, Math.floor(62 * fontScale));       // 主标题
    const titleSubFont = Math.max(14, Math.floor(32 * fontScale));    // 副标题
    const metaFont = Math.max(12, Math.floor(22 * fontScale));        // 元信息
    const dateFont = Math.max(14, Math.floor(30 * fontScale));        // 日期
    const teamFont = Math.max(14, Math.floor(28 * fontScale));        // 球队名
    const scoreFont = Math.max(16, Math.floor(36 * fontScale));       // 比分
    const timeFont = Math.max(10, Math.floor(20 * fontScale));        // 时间
    const venueFont = Math.max(10, Math.floor(18 * fontScale));       // 场馆
    const badgeFont = Math.max(10, Math.floor(20 * fontScale));       // 徽章
    
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
    const homeScore = (match.homeScore !== undefined && match.homeScore !== null) ? match.homeScore : ((match.home_score !== undefined && match.home_score !== null) ? match.home_score : null);
    const awayScore = (match.awayScore !== undefined && match.awayScore !== null) ? match.awayScore : ((match.away_score !== undefined && match.away_score !== null) ? match.away_score : null);
    
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
