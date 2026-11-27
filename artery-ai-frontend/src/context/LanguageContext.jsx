import React, { createContext, useContext, useEffect, useState } from 'react';
import teluguCatalog from '../i18n/te.json';

const decodeLegacyUtf8 = value => {
  try {
    const bytes = Array.from(value, character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
    return decodeURIComponent(bytes);
  } catch {
    return value;
  }
};

const languageOptions = [
  ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['hi', 'हिन्दी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['kn', 'ಕನ್ನಡ'],
  ['bn', 'বাংলা'], ['ar', 'العربية'], ['zh', '中文'], ['ja', '日本語'],
];
export const LANGUAGES = languageOptions.map(([code, name]) => [code, decodeLegacyUtf8(name)]);

// The catalog contains only fixed application copy. Exact matching deliberately
// leaves patient names, notes, and other free-text clinical content unchanged.
const teluguTranslations = Object.fromEntries(
  Object.entries(teluguCatalog).map(([source, translation]) => [source, decodeLegacyUtf8(translation)]),
);
const textNodes = new WeakMap();
const attributeValues = new WeakMap();
const translatedAttributes = ['placeholder', 'title', 'aria-label', 'alt'];

function translateTextNode(node, language) {
  const current = node.nodeValue;
  if (!current || !current.trim()) return;
  const state = textNodes.get(node) || { source: current, lastRendered: current, translated: null };
  if (current !== state.lastRendered) state.source = current;
  const leading = state.source.match(/^\s*/)?.[0] || '';
  const trailing = state.source.match(/\s*$/)?.[0] || '';
  const key = state.source.trim();
  const translated = language === 'te' ? teluguTranslations[key] : null;
  const next = translated ? `${leading}${translated}${trailing}` : state.source;
  state.translated = next === state.source ? null : next;
  state.lastRendered = next;
  textNodes.set(node, state);
  if (current !== next) node.nodeValue = next;
}

function translateAttributes(element, language) {
  let states = attributeValues.get(element);
  if (!states) { states = {}; attributeValues.set(element, states); }
  translatedAttributes.forEach(attribute => {
    if (!element.hasAttribute(attribute)) return;
    const current = element.getAttribute(attribute);
    const state = states[attribute] || { source: current, lastRendered: current, translated: null };
    if (current !== state.lastRendered) state.source = current;
    const translated = language === 'te' ? teluguTranslations[state.source.trim()] : null;
    const next = translated || state.source;
    state.translated = next === state.source ? null : next;
    state.lastRendered = next;
    states[attribute] = state;
    if (current !== next) element.setAttribute(attribute, next);
  });
}

function localizeSubtree(root, language) {
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root, language); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (root.matches('script,style,noscript,textarea,[contenteditable="true"]')) return;
    translateAttributes(root, language);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('script,style,noscript,textarea,[contenteditable="true"]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  while ((node = walker.nextNode())) translateTextNode(node, language);
  if (root.querySelectorAll) root.querySelectorAll('*').forEach(element => {
    if (!element.matches('script,style,noscript,textarea,[contenteditable="true"]')) translateAttributes(element, language);
  });
}

const labels = {
  en: ['Dashboard','Cases','X-rays','Reports','Training & Testing','Notifications','Doctors','AI Assistant','Profile','Sign Out','Total Cases','Pending Analysis','Completed Analysis','Case Management','X-ray & Angiogram Library','Search','Refresh'],
  es: ['Panel','Casos','Radiografías','Informes','Entrenamiento y pruebas','Notificaciones','Médicos','Asistente IA','Perfil','Cerrar sesión','Casos totales','Análisis pendiente','Análisis completado','Gestión de casos','Biblioteca de rayos X y angiogramas','Buscar','Actualizar'],
  fr: ['Tableau de bord','Dossiers','Radiographies','Rapports','Entraînement et tests','Notifications','Médecins','Assistant IA','Profil','Déconnexion','Total des dossiers','Analyse en attente','Analyse terminée','Gestion des dossiers','Bibliothèque radiographies et angiogrammes','Rechercher','Actualiser'],
  de: ['Übersicht','Fälle','Röntgenbilder','Berichte','Training und Tests','Benachrichtigungen','Ärzte','KI-Assistent','Profil','Abmelden','Fälle gesamt','Analyse ausstehend','Analyse abgeschlossen','Fallverwaltung','Röntgen- und Angiogramm-Bibliothek','Suchen','Aktualisieren'],
  hi: ['डैशबोर्ड','केस','एक्स-रे','रिपोर्ट','प्रशिक्षण और परीक्षण','सूचनाएँ','डॉक्टर','AI सहायक','प्रोफ़ाइल','साइन आउट','कुल केस','लंबित विश्लेषण','पूर्ण विश्लेषण','केस प्रबंधन','एक्स-रे और एंजियोग्राम लाइब्रेरी','खोजें','रीफ़्रेश'],
  ta: ['முகப்பு','வழக்குகள்','எக்ஸ்-ரே','அறிக்கைகள்','பயிற்சி மற்றும் சோதனை','அறிவிப்புகள்','மருத்துவர்கள்','AI உதவியாளர்','சுயவிவரம்','வெளியேறு','மொத்த வழக்குகள்','நிலுவை பகுப்பாய்வு','முடிந்த பகுப்பாய்வு','வழக்கு மேலாண்மை','எக்ஸ்-ரே மற்றும் ஆஞ்சியோகிராம்','தேடல்','புதுப்பி'],
  te: ['డ్యాష్‌బోర్డ్','కేసులు','ఎక్స్-రేలు','నివేదికలు','శిక్షణ మరియు పరీక్ష','నోటిఫికేషన్లు','వైద్యులు','AI సహాయకుడు','ప్రొఫైల్','సైన్ అవుట్','మొత్తం కేసులు','పెండింగ్ విశ్లేషణ','పూర్తయిన విశ్లేషణ','కేసు నిర్వహణ','ఎక్స్-రే మరియు యాంజియోగ్రామ్','వెతకండి','రిఫ్రెష్'],
  kn: ['ಡ್ಯಾಶ್‌ಬೋರ್ಡ್','ಪ್ರಕರಣಗಳು','ಎಕ್ಸ್-ರೇಗಳು','ವರದಿಗಳು','ತರಬೇತಿ ಮತ್ತು ಪರೀಕ್ಷೆ','ಅಧಿಸೂಚನೆಗಳು','ವೈದ್ಯರು','AI ಸಹಾಯಕ','ಪ್ರೊಫೈಲ್','ಸೈನ್ ಔಟ್','ಒಟ್ಟು ಪ್ರಕರಣಗಳು','ಬಾಕಿ ವಿಶ್ಲೇಷಣೆ','ಪೂರ್ಣ ವಿಶ್ಲೇಷಣೆ','ಪ್ರಕರಣ ನಿರ್ವಹಣೆ','ಎಕ್ಸ್-ರೇ ಮತ್ತು ಆಂಜಿಯೋಗ್ರಾಮ್','ಹುಡುಕಿ','ರಿಫ್ರೆಶ್'],
  bn: ['ড্যাশবোর্ড','কেস','এক্স-রে','রিপোর্ট','প্রশিক্ষণ ও পরীক্ষা','বিজ্ঞপ্তি','চিকিৎসক','AI সহকারী','প্রোফাইল','সাইন আউট','মোট কেস','অপেক্ষমাণ বিশ্লেষণ','সম্পন্ন বিশ্লেষণ','কেস ব্যবস্থাপনা','এক্স-রে ও অ্যাঞ্জিওগ্রাম লাইব্রেরি','খুঁজুন','রিফ্রেশ'],
  ar: ['لوحة المعلومات','الحالات','الأشعة السينية','التقارير','التدريب والاختبار','الإشعارات','الأطباء','مساعد الذكاء الاصطناعي','الملف الشخصي','تسجيل الخروج','إجمالي الحالات','تحليل قيد الانتظار','تحليل مكتمل','إدارة الحالات','مكتبة الأشعة السينية وتصوير الأوعية','بحث','تحديث'],
  zh: ['仪表板','病例','X光影像','报告','训练与测试','通知','医生','AI 助手','个人资料','退出登录','病例总数','待分析','已完成分析','病例管理','X光与血管造影影像库','搜索','刷新'],
  ja: ['ダッシュボード','症例','X線画像','レポート','トレーニングとテスト','通知','医師','AIアシスタント','プロフィール','ログアウト','症例総数','解析待ち','解析完了','症例管理','X線・血管造影ライブラリ','検索','更新'],
};
const keys = ['dashboard','cases','xrays','reports','training','notifications','doctors','assistant','profile','logout','totalCases','pendingCases','completedCases','caseManagement','xrayLibrary','search','refresh'];
const LanguageContext = createContext({ language: 'en', setLanguage: () => {}, t: key => key });

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('artery_language') || 'en');
  useEffect(() => {
    localStorage.setItem('artery_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localizeSubtree(document.body, language);
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'characterData') translateTextNode(record.target, language);
        else if (record.type === 'attributes') translateAttributes(record.target, language);
        else record.addedNodes.forEach(node => localizeSubtree(node, language));
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: translatedAttributes });
    return () => observer.disconnect();
  }, [language]);
  const values = (labels[language] || labels.en).map(decodeLegacyUtf8);
  const t = key => { const index = keys.indexOf(key); return index < 0 ? key : values[index] || labels.en[index]; };
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
