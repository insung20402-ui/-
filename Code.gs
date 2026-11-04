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

function addExpense(data) {
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
    String(data.name),
    String(data.category),
    Number(data.amount),
    Number(data.satisfaction),
    String(data.emotion)
  ]);

  return { success: true, message: '지출이 저장되었습니다!' };
}

function getExpenseAnalytics(user) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('지출DB');

  if (!sheet) return { hasData: false };

  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { hasData: false };

  var userGrade = user ? String(user.grade).trim() : '';
  var userClass = user ? String(user.classNum).trim() : '';
  var userNum = user ? String(user.studentNum).trim() : '';
  var userName = user ? String(user.name).trim() : '';
  var hasUser = userName.length > 0;

  var expenses = [];
  for (var i = 1; i < rows.length; i++) {
    if (hasUser) {
      var rGrade = String(rows[i][1]).trim();
      var rClass = String(rows[i][2]).trim();
      var rNum = String(rows[i][3]).trim();
      var rName = String(rows[i][4]).trim();
      if (rGrade != userGrade || rClass != userClass || rNum != userNum || rName != userName) {
        continue;
      }
    }

    var amt = Number(rows[i][6]);
    if (isNaN(amt) || amt <= 0) continue;

    var d;
    try { d = new Date(rows[i][0]); } catch (e) { d = new Date(); }

    expenses.push({
      dateStr: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
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

  for (var j = 0; j < expenses.length; j++) {
    var e = expenses[j];
    totalAmount += e.amount;
    satisfactionSum += e.satisfaction;

    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1;

    if (e.satisfaction <= 2 && (e.emotion === '스트레스' || e.emotion === '홧김')) {
      wasteTotal += e.amount;
    }

    if ((e.hour >= 22 || e.hour < 4) && e.satisfaction <= 2) {
      nightWasteTotal += e.amount;
    }

    if (e.category === '식비/카페') cafeCount++;
  }

  var avgSatisfaction = Math.round((satisfactionSum / expenses.length) * 10) / 10;
  var predictedNextMonth = Math.round(totalAmount * 1.04);

  var topCategory = '';
  var topCategoryAmt = 0;
  for (var cat in catTotals) {
    if (catTotals[cat] > topCategoryAmt) {
      topCategoryAmt = catTotals[cat];
      topCategory = cat;
    }
  }

  var advice = '';
  var tips = [];

  if (wasteTotal > 0) {
    tips.push('스트레스/홧김 지출이 ' + wasteTotal.toLocaleString() + '원 발생했어요. 감정이 올라올 땐 결제 전 10분만 기다려 보세요.');
  }
  if (nightWasteTotal > 0) {
    tips.push('밤 10시 이후 만족도 낮은 지출이 ' + nightWasteTotal.toLocaleString() + '원 있어요. 야간 충동구매를 줄여보세요.');
  }
  if (cafeCount > 10) {
    tips.push('식비/카페 지출 횟수가 ' + cafeCount + '회로 많습니다. 주 2회만 줄여도 월 4~6만원 절약 가능해요!');
  }
  if (topCategory && topCategoryAmt > totalAmount * 0.5) {
    tips.push('"' + topCategory + '" 카테고리에 전체의 ' + Math.round(topCategoryAmt / totalAmount * 100) + '%가 집중되어 있어요. 분산을 고려해 보세요.');
  }

  if (tips.length === 0) {
    advice = '만족도 높은 현명한 소비를 이어가고 계시네요! 이 흐름을 유지하면서 다음 달 예상 지출 범위 안에서 관리해 보세요.';
  } else {
    advice = tips.join('\n\n');
    advice += '\n\n다음 달 예상 지출은 약 ' + predictedNextMonth.toLocaleString() + '원입니다. 위 습관만 개선해도 절약이 가능해요!';
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
