const SPREADSHEET_ID = '1vmpuB7b06kXTE8hsHRXqprlICnBRuJkqR8cYEWl38hg';

function doGet() {
  initSheets();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('감성 가계부 & 소비 심리 분석')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function initSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (!ss.getSheetByName('사용자DB')) {
    var sheet = ss.insertSheet('사용자DB');
    sheet.appendRow(['등록일시', '학년', '반', '번호', '이름']);
    sheet.getRange('A1:E1').setFontWeight('bold').setBackground('#ffeaa7');
  }

  if (!ss.getSheetByName('지출DB')) {
    var sheet = ss.insertSheet('지출DB');
    sheet.appendRow(['일시', '학년', '반', '번호', '이름', '카테고리', '금액', '만족도', '감정태그']);
    sheet.getRange('A1:I1').setFontWeight('bold').setBackground('#ffeaa7');
  }
}

function registerUser(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('사용자DB');
  if (!sheet) {
    initSheets();
    sheet = ss.getSheetByName('사용자DB');
  }
  var rows = sheet.getDataRange().getValues();

  var grade = String(data.grade).trim();
  var classNum = String(data.classNum).trim();
  var studentNum = String(data.studentNum).trim();
  var name = String(data.name).trim();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() == grade &&
        String(rows[i][2]).trim() == classNum &&
        String(rows[i][3]).trim() == studentNum &&
        String(rows[i][4]).trim() == name) {
      return { success: true, message: '기존 프로필로 로그인되었습니다! 다른 탭을 이용하세요.' };
    }
  }

  sheet.appendRow([new Date(), Number(grade), Number(classNum), Number(studentNum), name]);
  return { success: true, message: '프로필이 등록되었습니다! 이제 다른 탭을 이용하세요.' };
}

function isRegistered(user) {
  if (!user || !user.name) return false;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('사용자DB');
  if (!sheet) return false;
  var rows = sheet.getDataRange().getValues();
  var grade = String(user.grade).trim();
  var classNum = String(user.classNum).trim();
  var studentNum = String(user.studentNum).trim();
  var name = String(user.name).trim();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() == grade &&
        String(rows[i][2]).trim() == classNum &&
        String(rows[i][3]).trim() == studentNum &&
        String(rows[i][4]).trim() == name) {
      return true;
    }
  }
  return false;
}

function addExpense(data) {
  if (!isRegistered(data)) {
    return { success: false, needsRegister: true, message: '등록되지 않은 사용자입니다. 먼저 프로필을 등록해 주세요.' };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('지출DB');
  if (!sheet) {
    initSheets();
    sheet = ss.getSheetByName('지출DB');
  }

  var dt;
  try {
    dt = new Date(data.datetime);
    if (isNaN(dt.getTime())) dt = new Date();
  } catch (e) {
    dt = new Date();
  }

  sheet.appendRow([
    dt,
    Number(data.grade),
    Number(data.classNum),
    Number(data.studentNum),
    String(data.name).trim(),
    String(data.category),
    Number(data.amount),
    Number(data.satisfaction),
    String(data.emotion)
  ]);

  return { success: true, message: '지출이 저장되었습니다!' };
}

function getExpenseAnalytics(user) {
  if (!isRegistered(user)) {
    return { hasData: false, needsRegister: true };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('지출DB');

  if (!sheet) return { hasData: false };

  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { hasData: false };

  var userGrade = String(user.grade).trim();
  var userClass = String(user.classNum).trim();
  var userNum = String(user.studentNum).trim();
  var userName = String(user.name).trim();

  var expenses = [];
  for (var i = 1; i < rows.length; i++) {
    var rGrade = String(rows[i][1]).trim();
    var rClass = String(rows[i][2]).trim();
    var rNum = String(rows[i][3]).trim();
    var rName = String(rows[i][4]).trim();
    if (rGrade != userGrade || rClass != userClass || rNum != userNum || rName != userName) {
      continue;
    }

    var amt = Number(rows[i][6]);
    if (isNaN(amt) || amt <= 0) continue;

    var d;
    try { d = new Date(rows[i][0]); } catch (e) { d = new Date(); }

    expenses.push({
      monthKey: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM'),
      weekday: d.getDay(),
      hour: d.getHours(),
      category: String(rows[i][5] || '기타'),
      amount: amt,
      satisfaction: Number(rows[i][7]) || 3,
      emotion: String(rows[i][8] || '평온/일상')
    });
  }

  if (expenses.length === 0) return { hasData: false };

  var totalAmount = 0;
  var catTotals = {};
  var emotionCounts = {};
  var satisfactionSum = 0;
  var wasteTotal = 0;
  var nightWasteTotal = 0;
  var cafeCount = 0;
  var monthTotals = {};
  var weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  var wasteByEmotion = {};

  for (var j = 0; j < expenses.length; j++) {
    var e = expenses[j];
    totalAmount += e.amount;
    satisfactionSum += e.satisfaction;

    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1;
    monthTotals[e.monthKey] = (monthTotals[e.monthKey] || 0) + e.amount;
    weekdayTotals[e.weekday] += e.amount;

    if (e.satisfaction <= 2 && (e.emotion === '스트레스' || e.emotion === '홧김')) {
      wasteTotal += e.amount;
      wasteByEmotion[e.emotion] = (wasteByEmotion[e.emotion] || 0) + e.amount;
    }

    if ((e.hour >= 22 || e.hour < 4) && e.satisfaction <= 2) {
      nightWasteTotal += e.amount;
    }

    if (e.category === '식비/카페') cafeCount++;
  }

  var avgSatisfaction = Math.round((satisfactionSum / expenses.length) * 10) / 10;

  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var nowKey = Utilities.formatDate(now, tz, 'yyyy-MM');
  var dayOfMonth = Number(Utilities.formatDate(now, tz, 'd'));
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  var monthKeys = Object.keys(monthTotals).sort();
  var series = [];
  for (var k = 0; k < monthKeys.length; k++) {
    var mv = monthTotals[monthKeys[k]];
    if (monthKeys[k] === nowKey) {
      mv = mv + (mv / dayOfMonth) * (daysInMonth - dayOfMonth) * Math.min(1, dayOfMonth / 10);
    }
    series.push(mv);
  }
  var recent = series.slice(-3);
  var wSum = 0;
  var wTotal = 0;
  for (var r = 0; r < recent.length; r++) {
    wSum += recent[r] * (r + 1);
    wTotal += (r + 1);
  }
  var predictedNextMonth = Math.round(wSum / wTotal);
  var predictBasis = recent.length >= 2 ? ('최근 ' + recent.length + '개월 가중 이동평균') : '이번 달 소비 속도 기준';

  var topCategory = '';
  var topCategoryAmt = 0;
  for (var cat in catTotals) {
    if (catTotals[cat] > topCategoryAmt) {
      topCategoryAmt = catTotals[cat];
      topCategory = cat;
    }
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function won(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }

  var nm = userName;
  var dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  var topDay = 0;
  for (var w = 1; w < 7; w++) {
    if (weekdayTotals[w] > weekdayTotals[topDay]) topDay = w;
  }
  var topDayName = dayNames[topDay] + '요일';
  var topCatShare = Math.round(topCategoryAmt / totalAmount * 100);
  var avgPerSpend = Math.round(totalAmount / expenses.length);
  var wasteRatio = Math.round(wasteTotal / totalAmount * 100);
  var diffPct = (recent.length >= 2 && recent[recent.length - 2] > 0)
    ? Math.round((recent[recent.length - 1] - recent[recent.length - 2]) / recent[recent.length - 2] * 100)
    : null;

  var focus = pick([
    '"' + topCategory + '" 비중이 ' + topCatShare + '%로 가장 커요.',
    topDayName + '에 지출이 가장 몰려 있어요.',
    '한 번 쓸 때 평균 ' + won(avgPerSpend) + '을 쓰고 있어요.'
  ]);

  var predictMsg;
  if (diffPct === null) {
    predictMsg = pick([
      nm + '님 기록 기준으로 다음 달은 약 ' + won(predictedNextMonth) + '이 예상돼요.',
      '지금 소비 속도라면 다음 달은 ' + won(predictedNextMonth) + ' 안팎이에요, ' + nm + '님.',
      '기록이 아직 쌓이는 중이라 ' + won(predictedNextMonth) + ' 정도로 잡아봤어요. 기록이 늘수록 정확해져요!'
    ]);
  } else if (diffPct >= 10) {
    predictMsg = pick([
      '소비가 전달보다 ' + diffPct + '% 늘어나는 추세예요. 다음 달은 ' + won(predictedNextMonth) + '이 예상돼요. 허리띠를 조금 조여볼까요?',
      nm + '님, 지출이 늘고 있어서 다음 달은 ' + won(predictedNextMonth) + '까지 갈 수 있어요 (최근 +' + diffPct + '%).',
      '소비가 늘어나는 추세예요! 다음 달 예상 ' + won(predictedNextMonth) + ' (최근 +' + diffPct + '%).'
    ]);
  } else if (diffPct <= -10) {
    predictMsg = pick([
      '소비가 전달보다 ' + Math.abs(diffPct) + '% 줄었어요! 다음 달은 ' + won(predictedNextMonth) + '으로 예상돼요.',
      nm + '님, 지출이 줄고 있어요. 다음 달 예상은 ' + won(predictedNextMonth) + '이에요. 잘하고 있어요!',
      '지출이 안정되고 있어요 (최근 ' + diffPct + '%). 다음 달 예상은 ' + won(predictedNextMonth) + '입니다.'
    ]);
  } else {
    predictMsg = pick([
      '다음 달도 비슷한 흐름으로 ' + won(predictedNextMonth) + ' 정도가 예상돼요.',
      nm + '님의 소비 패턴이 꾸준해서 다음 달 예상은 ' + won(predictedNextMonth) + '이에요.',
      '큰 변화 없이 ' + won(predictedNextMonth) + ' 안팎으로 예상돼요.'
    ]);
  }
  predictMsg += ' ' + focus;

  var topWasteEmotion = '';
  var topWasteEmoAmt = 0;
  for (var we in wasteByEmotion) {
    if (wasteByEmotion[we] > topWasteEmoAmt) {
      topWasteEmoAmt = wasteByEmotion[we];
      topWasteEmotion = we;
    }
  }

  var items = [
    { n: '아메리카노', p: 4500, u: '잔' },
    { n: '편의점 도시락', p: 5000, u: '개' },
    { n: '영화 티켓', p: 14000, u: '장' },
    { n: '치킨', p: 20000, u: '마리' }
  ];
  var it = pick(items);
  var cnt = Math.floor(wasteTotal / it.p);
  var equiv = cnt >= 1 ? ' ' + it.n + ' ' + cnt + it.u + ' 값이에요.' : '';
  var cutPct = pick([20, 30, 50]);
  var saveAmt = Math.round(wasteTotal * cutPct / 100);

  var wasteMsg;
  if (wasteTotal === 0) {
    wasteMsg = pick([
      nm + '님, 감정 때문에 쓴 아까운 돈이 하나도 없어요! 평균 만족도 ' + avgSatisfaction + '점, 아주 좋아요.',
      '낭비 0원! 충동 없이 계획적으로 쓰고 있어요, ' + nm + '님.',
      '스트레스나 홧김 지출이 없어요. 이 습관을 다음 달에도 이어가 보세요.'
    ]);
  } else if (wasteRatio < 10) {
    wasteMsg = pick([
      '감정적 낭비는 ' + won(wasteTotal) + '(' + wasteRatio + '%)로 적은 편이에요.' + equiv,
      nm + '님, ' + won(wasteTotal) + ' 정도만 아깝게 썼어요. 거의 다 잘 쓰고 있어요!' + equiv,
      '낭비 비중이 ' + wasteRatio + '%밖에 안 돼요. 이 정도면 훌륭해요.'
    ]);
  } else {
    wasteMsg = pick([
      '전체 지출의 ' + wasteRatio + '%(' + won(wasteTotal) + ')가 후회되는 소비였어요.' + equiv,
      nm + '님, "' + topWasteEmotion + '" 상태에서 가장 많이 샀어요 (' + won(topWasteEmoAmt) + ').' + equiv,
      '아깝게 쓴 돈이 ' + won(wasteTotal) + '이에요.' + equiv + ' 결제 전에 10분만 기다려 보세요.'
    ]);
    wasteMsg += ' 다음 달 낭비를 ' + cutPct + '% 줄이면 ' + won(saveAmt) + '을 아낄 수 있어요.';
  }
  if (nightWasteTotal > 0) {
    wasteMsg += ' 특히 밤 10시 이후에 ' + won(nightWasteTotal) + '을 후회하며 썼어요.';
  }

  var advice = '';
  var tips = [];

  if (wasteTotal > 0) {
    tips.push(pick([
      '감정이 올라올 땐 결제 전 10분만 기다려 보세요.',
      '화나거나 스트레스받을 땐 장바구니에 담고 하루 뒤에 결정해 보세요.',
      '기분 풀이용 소비 대신 산책이나 운동 같은 대안을 하나 정해 두세요.'
    ]));
  }
  if (nightWasteTotal > 0) {
    tips.push(pick([
      '밤 10시 이후엔 쇼핑앱 알림을 꺼 두면 충동구매가 줄어요.',
      '야식 주문 대신 집에 있는 간식으로 버텨 보세요.'
    ]));
  }
  if (cafeCount > 10) {
    tips.push('식비/카페 지출이 ' + cafeCount + '회예요. 주 2회만 줄여도 월 4~6만원 절약 가능해요!');
  }
  if (topCategory && topCategoryAmt > totalAmount * 0.5) {
    tips.push('"' + topCategory + '"에 전체의 ' + topCatShare + '%가 집중되어 있어요. 다음 달엔 이 항목 예산을 먼저 정해 보세요.');
  }

  if (tips.length === 0) {
    advice = pick([
      '만족도 높은 현명한 소비를 이어가고 계시네요! 이 흐름을 유지해 보세요.',
      '지출 패턴이 안정적이에요. 다음 달에도 지금처럼만 해 보세요!',
      nm + '님은 후회 없는 소비를 하고 있어요. 기록을 꾸준히 이어가 보세요.'
    ]);
  } else {
    advice = tips.join('\n\n');
  }

  var catLabels = [];
  var catValues = [];
  for (var c in catTotals) {
    catLabels.push(c);
    catValues.push(catTotals[c]);
  }

  var emotionLabels = [];
  var emotionValues = [];
  for (var em in emotionCounts) {
    emotionLabels.push(em);
    emotionValues.push(emotionCounts[em]);
  }

  return {
    hasData: true,
    totalAmount: totalAmount,
    predictedNextMonth: predictedNextMonth,
    predictBasis: predictBasis,
    predictMsg: predictMsg,
    wasteMsg: wasteMsg,
    wasteAmount: wasteTotal,
    nightWasteAmount: nightWasteTotal,
    avgSatisfaction: avgSatisfaction,
    expenseCount: expenses.length,
    advice: advice,
    catLabels: catLabels,
    catValues: catValues,
    emotionLabels: emotionLabels,
    emotionValues: emotionValues
  };
}
