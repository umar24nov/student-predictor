

import { useState, useEffect, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" });
}

async function saveResponse(answers, result) {
  try {
    await fetch(`${API_URL}/save-response`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers, prediction: result.prediction, confidence: result.confidence,
        confidence_scores: result.confidence_scores, timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {}
}

// ─── Grade range → midpoint on 0-20 scale ────────────────────────────────────
const GRADE_MAP = { "0-2":1, "3-4":3.5, "5-6":5.5, "7-8":7.5, "9-10":9.5 };
const ABS_MAP   = { "above90":2, "75-90":8, "60-75":18, "below60":30 };

// Converts all collected answers into the exact payload the FastAPI model expects
function buildPayload(a) {
  // Use Intermediate/12th grade as G1 proxy if student just entered university (sem=1)
  // Otherwise use actual semester grades
  const sem = parseInt(a.currentSem) || 1;

  let g1Raw, g2Raw;
  if (sem === 1) {
    // Just entered — use 12th grade as G1 reference, same for G2
    g1Raw = a.interGrade || a.G1 || "5-6";
    g2Raw = a.interGrade || a.G2 || "5-6";
  } else {
    g1Raw = a.G1 || "5-6";
    g2Raw = a.G2 || a.G1 || "5-6";
  }

  return {
    sex: a.sex || "M",
    age: parseInt(a.age) || 19,
    address: a.address || "U",
    famsize: "GT3", Pstatus: "T",
    Medu: parseInt(a.Medu) || 2,
    Fedu: parseInt(a.Fedu) || 2,
    Mjob: a.Mjob || "other",
    Fjob: a.Fjob || "other",
    reason: "course", guardian: "mother", traveltime: 1,
    studytime: parseInt(a.studytime) || 2,
    failures: parseInt(a.failures) || 0,
    schoolsup: a.schoolsup || "no",
    famsup: a.famsup || "yes",
    paid: a.paid || "no",
    activities: a.activities || "no",
    nursery: "yes",
    higher: a.higher || "yes",
    internet: a.internet || "yes",
    romantic: "no", famrel: 4, freetime: 3, goout: 3, Dalc: 1, Walc: 1,
    health: parseInt(a.health) || 3,
    absences: ABS_MAP[a.attendance] ?? 8,
    G1: Math.round((GRADE_MAP[g1Raw] ?? 7.5) * 2),
    G2: Math.round((GRADE_MAP[g2Raw] ?? 7.5) * 2),
  };
}

// Grade options reused across multiple questions
const GRADE_OPTIONS = [
  {v:"0-2",l:"0 – 2",e:"😟"},{v:"3-4",l:"3 – 4",e:"😕"},
  {v:"5-6",l:"5 – 6",e:"😐"},{v:"7-8",l:"7 – 8",e:"🙂"},
  {v:"9-10",l:"9 – 10",e:"🌟"},
];

// ─── Static base questions (always shown) ─────────────────────────────────────
const BASE_QUESTIONS = [
  { id:"sex", section:"About You", icon:"👤", q:"What is your gender?",
    type:"choice", cols:2, options:[{v:"M",l:"Male",e:"👦"},{v:"F",l:"Female",e:"👧"}] },

  { id:"age", section:"About You", icon:"🎂", q:"How old are you?",
    type:"number", min:15, max:35, placeholder:"e.g. 19" },

  { id:"address", section:"About You", icon:"🏘️", q:"Where do you live?",
    type:"choice", cols:2, options:[{v:"U",l:"Urban / City",e:"🏙️"},{v:"R",l:"Rural / Village",e:"🌾"}] },

  // Which semester the student is currently in — drives dynamic grade questions
  { id:"currentSem", section:"About You", icon:"📅",
    q:"Which semester / year are you currently in?",
    type:"choice", cols:2, options:[
      {v:"1",l:"1st Semester / 1st Year",e:"🆕"},
      {v:"2",l:"2nd Semester",e:"2️⃣"},
      {v:"3",l:"3rd Semester / 2nd Year",e:"3️⃣"},
      {v:"4",l:"4th Semester",e:"4️⃣"},
      {v:"5",l:"5th Semester / 3rd Year",e:"5️⃣"},
      {v:"6",l:"6th Semester",e:"6️⃣"},
      {v:"7",l:"7th Semester / 4th Year",e:"7️⃣"},
      {v:"8",l:"8th Semester / Final",e:"🎓"},
    ]},

  { id:"Medu", section:"Family Background", icon:"👩‍🎓", q:"What is your mother's highest education?",
    type:"choice", cols:2, options:[
      {v:"0",l:"No formal education",e:"—"},{v:"1",l:"Up to Primary / 5th",e:"📖"},
      {v:"2",l:"Middle school / 8th",e:"📚"},{v:"3",l:"10th / 12th passed",e:"🏫"},
      {v:"4",l:"Graduate or higher",e:"🎓"}] },

  { id:"Fedu", section:"Family Background", icon:"👨‍🎓", q:"What is your father's highest education?",
    type:"choice", cols:2, options:[
      {v:"0",l:"No formal education",e:"—"},{v:"1",l:"Up to Primary / 5th",e:"📖"},
      {v:"2",l:"Middle school / 8th",e:"📚"},{v:"3",l:"10th / 12th passed",e:"🏫"},
      {v:"4",l:"Graduate or higher",e:"🎓"}] },

  { id:"Mjob", section:"Family Background", icon:"👩‍💼", q:"What is your mother's occupation?",
    type:"choice", cols:2, options:[
      {v:"teacher",l:"Teacher / Lecturer",e:"👩‍🏫"},{v:"health",l:"Healthcare / Doctor / Nurse",e:"🏥"},
      {v:"services",l:"Govt / Civil Services",e:"🏛️"},{v:"at_home",l:"Homemaker",e:"🏠"},
      {v:"other",l:"Business / Private / Other",e:"💼"}] },

  { id:"Fjob", section:"Family Background", icon:"👨‍💼", q:"What is your father's occupation?",
    type:"choice", cols:2, options:[
      {v:"teacher",l:"Teacher / Lecturer",e:"👨‍🏫"},{v:"health",l:"Healthcare / Doctor",e:"🏥"},
      {v:"services",l:"Govt / Civil Services",e:"🏛️"},{v:"other",l:"Farmer / Agriculture",e:"🌾"},
      {v:"at_home",l:"Business / Private",e:"💼"}] },

  { id:"studytime", section:"Academics", icon:"📖", q:"How many hours do you study per week (outside class)?",
    type:"choice", cols:2, options:[
      {v:"1",l:"Less than 2 hours",e:"😬"},{v:"2",l:"2–5 hours",e:"📚"},
      {v:"3",l:"5–10 hours",e:"💡"},{v:"4",l:"More than 10 hours",e:"🌟"}] },

  { id:"failures", section:"Academics", icon:"📉", q:"How many courses / subjects have you failed before?",
    type:"choice", cols:4, options:[
      {v:"0",l:"None",e:"✅"},{v:"1",l:"1",e:"1️⃣"},
      {v:"2",l:"2",e:"2️⃣"},{v:"3",l:"3 or more",e:"⚠️"}] },

  { id:"attendance", section:"Academics", icon:"🏫", q:"What is your attendance percentage this year?",
    type:"choice", cols:2, options:[
      {v:"above90",l:"Above 90%",e:"🌟"},{v:"75-90",l:"75% – 90%",e:"✅"},
      {v:"60-75",l:"60% – 75%",e:"⚠️"},{v:"below60",l:"Below 60%",e:"🚨"}] },
];

// ─── Tail questions (always shown after grades) ───────────────────────────────
const TAIL_QUESTIONS = [
  { id:"higher", section:"Future Plans", icon:"🎓", q:"Do you plan to pursue higher education after this?",
    type:"yesno" },
  { id:"internet", section:"Support", icon:"🌐", q:"Do you have reliable internet access at home?",
    type:"yesno" },
  { id:"health", section:"About You", icon:"💪", q:"How is your health these days?",
    type:"choice", cols:3, options:[
      {v:"1",l:"Very poor",e:"🤒"},{v:"2",l:"Below average",e:"😔"},
      {v:"3",l:"Average",e:"😐"},{v:"4",l:"Good",e:"🙂"},{v:"5",l:"Excellent",e:"💪"}] },
];

/**
 * Builds the full dynamic question list based on current answers.
 * - Sem 1: asks Intermediate / 12th grade (no semester grades yet)
 * - Sem 2+: asks G1 (required), G2 (required)
 * - Sem 3+: asks G3, G4 … up to completed sems (all optional after G2)
 * All grade questions use GRADE_OPTIONS (ranges out of 10)
 */
function buildQuestions(answers) {
  const sem = parseInt(answers.currentSem) || 0;
  const questions = [...BASE_QUESTIONS];

  if (sem === 0) {
    // currentSem not answered yet — no grade questions inserted yet
    return [...questions, ...TAIL_QUESTIONS];
  }

  if (sem === 1) {
    // Just entered university — ask about Intermediate / 12th marks as reference
    questions.push({
      id: "interGrade", section: "Your Grades", icon: "🏫",
      q: "What were your marks in Intermediate / 12th Board?",
      hint: "Pick the closest range — marks out of 10 (e.g. 75% ≈ 7–8)",
      type: "choice", cols: 3, options: GRADE_OPTIONS,
    });
    questions.push({
      id: "prevGrade", section: "Your Grades", icon: "📖",
      q: "What was your overall academic performance before university?",
      hint: "Think of your 10th standard / CBSE / ICSE result",
      type: "choice", cols: 3, options: GRADE_OPTIONS,
    });
  } else {
    // Sem 2 or above — ask semester grades
    // Sem 1 grade — always required
    questions.push({
      id: "G1", section: "Your Grades", icon: "📝",
      q: "What were your marks in Semester 1?",
      hint: "Pick the closest range — marks out of 10",
      type: "choice", cols: 3, options: GRADE_OPTIONS,
    });

    // Sem 2 grade — required if sem >= 2
    if (sem >= 2) {
      questions.push({
        id: "G2", section: "Your Grades", icon: "📊",
        q: "What were your marks in Semester 2?",
        hint: "Pick the closest range — marks out of 10",
        type: "choice", cols: 3, options: GRADE_OPTIONS,
      });
    }

    // Sem 3 onwards — optional, one per completed semester
    const semLabels = ["3","4","5","6","7","8"];
    const semIcons  = ["3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","🎓"];
    const completedExtra = Math.max(0, sem - 2); // semesters beyond 2 that are completed
    for (let i = 0; i < Math.min(completedExtra, 6); i++) {
      const semNum = i + 3;
      questions.push({
        id: `G${semNum}extra`, section: "Your Grades", icon: semIcons[i],
        q: `What were your marks in Semester ${semLabels[i]}?`,
        hint: "Optional — skip if you don't remember",
        type: "choice", cols: 3, options: GRADE_OPTIONS,
        optional: true,
      });
    }
  }

  return [...questions, ...TAIL_QUESTIONS];
}

// ─── Small UI atoms ────────────────────────────────────────────────────────────

function Tag({ color = "blue", children }) {
  const c = {
    blue:    "text-blue-400 bg-blue-500/10 border-blue-500/25",
    violet:  "text-violet-400 bg-violet-500/10 border-violet-500/25",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    yellow:  "text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
  };
  return <span className={`inline-block text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full border ${c[color]}`}>{children}</span>;
}

function PageShell({ children, onBack }) {
  return (
    <div className="relative z-10 min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          ← Back to Home
        </button>
        {children}
      </div>
    </div>
  );
}

/**
 * ChoiceGrid — hover-only highlight, no persistent selected state shown.
 * Selecting auto-advances the quiz so the card never stays "marked".
 * On the BACK journey (revisiting a question), we still show a subtle
 * indicator so the user knows what they picked — but it's a soft outline, not filled.
 */
function ChoiceGrid({ options, cols = 2, value, onSelect, autoAdvance = true }) {
  const [hovered, setHovered] = useState(null);
  const grid = { 2:"grid-cols-2", 3:"grid-cols-3", 4:"grid-cols-2 sm:grid-cols-4" }[cols] || "grid-cols-2";
  const isMultiCol = cols >= 3;

  return (
    <div className={`grid ${grid} gap-2.5`}>
      {options.map(o => {
        const isHov = hovered === o.v;
        const isPrev = value === o.v; // previously selected (came back to this Q)
        return (
          <button
            key={o.v}
            onClick={() => onSelect(o.v)}
            onMouseEnter={() => setHovered(o.v)}
            onMouseLeave={() => setHovered(null)}
            className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-sm font-medium text-left transition-all duration-150
              ${isMultiCol ? "flex-col items-center text-center text-xs gap-1.5 py-3.5" : ""}
              ${isHov
                ? "border-blue-400 bg-blue-500/15 text-white shadow shadow-blue-500/20 scale-[1.02]"
                : isPrev
                  ? "border-white/20 bg-white/5 text-slate-200"   // soft re-visited indicator
                  : "border-white/8 bg-white/3 text-slate-400"
              }`}
          >
            <span className={isMultiCol ? "text-2xl" : "text-xl leading-none"}>{o.e}</span>
            <span className="leading-tight">{o.l}</span>
          </button>
        );
      })}
    </div>
  );
}

function YesNoInput({ value, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div className="grid grid-cols-2 gap-3">
      {[{v:"yes",l:"Yes",e:"✅"},{v:"no",l:"No",e:"❌"}].map(o => {
        const isHov = hovered === o.v;
        const isPrev = value === o.v;
        return (
          <button key={o.v} onClick={() => onSelect(o.v)}
            onMouseEnter={() => setHovered(o.v)} onMouseLeave={() => setHovered(null)}
            className={`flex items-center justify-center gap-3 py-4 rounded-xl border text-base font-semibold transition-all
              ${isHov
                ? "border-blue-400 bg-blue-500/15 text-white scale-[1.02]"
                : isPrev ? "border-white/20 bg-white/5 text-slate-200"
                : "border-white/8 bg-white/3 text-slate-400"}`}>
            <span className="text-2xl">{o.e}</span>{o.l}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, placeholder }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, (parseInt(value)||min+1)-1))}
        className="w-12 h-12 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-bold hover:border-blue-400/50 hover:text-blue-400 transition-all">−</button>
      <input type="number" value={value||""} placeholder={placeholder} min={min} max={max}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-center text-2xl font-bold outline-none focus:border-blue-500 transition-colors"/>
      <button onClick={() => onChange(Math.min(max, (parseInt(value)||min-1)+1))}
        className="w-12 h-12 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-bold hover:border-blue-400/50 hover:text-blue-400 transition-all">+</button>
    </div>
  );
}

// ─── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({ result, onRetry, onHome, onRate }) {
  const cfg = {
    Pass:     { grad:"from-emerald-950 to-emerald-900", accent:"text-emerald-400", bar:"#34d399" },
    Fail:     { grad:"from-orange-950 to-orange-900",   accent:"text-orange-400",  bar:"#fb923c" },
    "At-Risk":{ grad:"from-red-950 to-red-900",         accent:"text-red-400",     bar:"#f87171" },
  };
  const barC = { Pass:"#34d399", Fail:"#fb923c", "At-Risk":"#f87171" };
  const c = cfg[result.prediction] || cfg["Fail"];
  const scores = result.confidence_scores || {};

  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-popIn">
      <div className={`bg-gradient-to-br ${c.grad} p-10 text-center relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-20" style={{background:`radial-gradient(circle at 50% 60%,${c.bar},transparent 65%)`}}/>
        <span className="text-6xl block mb-4 relative z-10">{result.emoji}</span>
        <p className={`text-xs font-bold tracking-widest uppercase ${c.accent} mb-2 relative z-10`}>Academic Performance Prediction</p>
        <h2 className={`font-display text-4xl sm:text-5xl font-extrabold ${c.accent} relative z-10`}>{result.prediction}</h2>
        <p className="text-white/70 text-sm mt-2 relative z-10">AI Confidence: <strong className="text-white">{result.confidence}%</strong></p>
      </div>
      <div className="bg-[#0d1220] p-6 sm:p-8">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">Probability Breakdown</p>
        {Object.entries(scores).map(([label, pct]) => (
          <div key={label} className="flex items-center gap-3 mb-3.5">
            <span className="text-sm font-semibold w-16 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-white/6 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{width:`${pct}%`,background:barC[label]||"#8892a4"}}/>
            </div>
            <span className="text-xs font-bold text-slate-400 w-10 text-right">{pct}%</span>
          </div>
        ))}
        <div className="bg-white/4 border border-white/8 rounded-2xl p-5 mt-5">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">What this means for you</p>
          <p className="text-sm text-slate-300 leading-relaxed">{result.tip}</p>
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0"/>
          Model trained on {result.dataset_size||"395"} students · Accuracy: {result.model_accuracy} · Random Forest
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
          <button onClick={onRetry} className="py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/8 transition-all">🔄 Retry</button>
          <button onClick={onHome}  className="py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/8 transition-all">🏠 Home</button>
          <button onClick={onRate}  className="py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-bold hover:bg-yellow-500/15 transition-all">★ Rate Us</button>
          <button onClick={() => navigator.share?.({title:"AcademicAI Result",text:`My prediction: ${result.prediction} (${result.confidence}% confidence)`}).catch(()=>{})}
            className="py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 transition-all">📤 Share</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inner pages ───────────────────────────────────────────────────────────────
function RateUsPage({ onBack }) {
  const [rating,setRating]=useState(0);const[hover,setHover]=useState(0);const[msg,setMsg]=useState("");const[name,setName]=useState("");const[tags,setTags]=useState([]);const[done,setDone]=useState(false);
  const TAGS=["Accuracy","Easy to use","Question design","Speed","Result clarity","Mobile friendly"];
  if(done)return(<PageShell onBack={onBack}><div className="bg-[#0d1220] border border-white/8 rounded-3xl p-10 text-center"><div className="text-6xl mb-4">🎉</div><h2 className="font-display text-3xl font-extrabold mb-3">Thank You!</h2><p className="text-slate-400 text-sm">Your {rating}-star rating helps improve AcademicAI.</p><div className="flex justify-center gap-1 mt-4">{[1,2,3,4,5].map(s=><span key={s} className={`text-2xl ${s<=rating?"text-yellow-400":"text-slate-700"}`}>★</span>)}</div><button onClick={onBack} className="mt-8 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold transition-all">Back to Home</button></div></PageShell>);
  return(<PageShell onBack={onBack}><Tag color="yellow">Rate Us</Tag><h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-2 tracking-tight">How Was Your Experience?</h1><p className="text-slate-400 text-sm mb-8">Your feedback helps us improve AcademicAI for every student.</p><div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 space-y-6"><div><p className="text-sm font-semibold mb-3 text-slate-300">Overall Rating <span className="text-red-400">*</span></p><div className="flex gap-2">{[1,2,3,4,5].map(s=><button key={s} onClick={()=>setRating(s)} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} className="text-4xl transition-all hover:scale-110"><span className={(hover||rating)>=s?"text-yellow-400":"text-slate-700"}>★</span></button>)}</div>{(hover||rating)>0&&<p className="text-sm text-slate-400 mt-2">{["","Terrible 😞","Not great 😕","Okay 😐","Good 👍","Excellent 🌟"][hover||rating]}</p>}</div><div><label className="block text-sm font-semibold text-slate-300 mb-2">Name <span className="text-slate-600 text-xs">(optional)</span></label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rohan Sharma" className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"/></div><div><p className="text-sm font-semibold text-slate-300 mb-3">What did you like? <span className="text-slate-600 text-xs">(optional)</span></p><div className="flex flex-wrap gap-2">{TAGS.map(t=><button key={t} onClick={()=>setTags(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${tags.includes(t)?"border-blue-500 bg-blue-500/10 text-blue-300":"border-white/10 text-slate-400 hover:border-white/20 bg-white/3"}`}>{t}</button>)}</div></div><div><label className="block text-sm font-semibold text-slate-300 mb-2">Feedback <span className="text-slate-600 text-xs">(optional)</span></label><textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="Tell us what could be better..." className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"/></div><button onClick={()=>rating&&setDone(true)} disabled={!rating} className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${rating?"bg-gradient-to-r from-blue-500 to-violet-600 hover:-translate-y-0.5":"bg-white/5 text-slate-600 cursor-not-allowed"}`}>{rating?`Submit ${rating}-Star Rating ★`:"Select a rating first"}</button></div></PageShell>);
}

function AboutPage({ onBack }) {
  return(<PageShell onBack={onBack}><Tag color="blue">About</Tag><h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-8 tracking-tight">About AcademicAI</h1><div className="bg-[#0d1220] border border-white/8 rounded-3xl overflow-hidden"><div className="bg-gradient-to-br from-blue-950 to-violet-950 p-10 text-center"><div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-4xl mx-auto mb-5">👨‍💻</div><h2 className="font-display text-2xl sm:text-3xl font-extrabold mb-1">Mohammad Umar</h2><p className="text-blue-300 text-sm font-semibold tracking-wide">B.Tech — Computer Science & Engineering</p></div><div className="p-6 sm:p-10 space-y-7">{[["About the Creator","Hi! I'm Mohammad Umar, a B.Tech CSE student passionate about Machine Learning. AcademicAI is a full-stack ML project covering data preprocessing, model training, REST API, and a complete web interface."],["About AcademicAI","AcademicAI uses a Random Forest model trained on the UCI Student Performance dataset to classify students as Pass, Fail, or At-Risk based on academic, family, and background factors."]].map(([t,d])=><div key={t}><h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">{t}</h3><p className="text-slate-300 text-sm leading-relaxed">{d}</p></div>)}<div><h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Tech Stack</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[["⚛️","React.js","Frontend"],["🎨","Tailwind CSS","Styling"],["🐍","FastAPI","Backend"],["🤖","scikit-learn","ML"],["🌲","Random Forest","Algorithm"],["📊","Python","Data Science"]].map(([e,n,r])=><div key={n} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center"><div className="text-2xl mb-1">{e}</div><div className="text-sm font-bold">{n}</div><div className="text-xs text-slate-500 mt-0.5">{r}</div></div>)}</div></div><div><h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Connect</h3><div className="flex flex-col sm:flex-row gap-3">{[["🐙","GitHub","github.com/umar24nov","https://github.com/umar24nov"],["💼","LinkedIn","mohammadumarfarook","https://www.linkedin.com/in/mohammadumarfarook"],["📧","Email","umar24nov@gmail.com","mailto:umar24nov@gmail.com"]].map(([e,l,v,h])=><a key={l} href={h} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 hover:border-white/20 hover:bg-white/8 transition-all"><span className="text-xl">{e}</span><div><div className="text-sm font-bold">{l}</div><div className="text-xs text-slate-500">{v}</div></div></a>)}</div></div></div></div></PageShell>);
}

function LegalPage({ onBack, title, tag, sections }) {
  return(<PageShell onBack={onBack}><Tag color="violet">{tag}</Tag><h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">{title}</h1><p className="text-slate-500 text-xs mt-2 mb-8">Last updated: March 2025</p><div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-10">{sections.map(([t,d],i)=><div key={t} className={i>0?"border-t border-white/6 pt-6 mt-6":""}><h3 className="font-bold text-sm text-white mb-2">{t}</h3><p className="text-sm text-slate-400 leading-relaxed">{d}</p></div>)}</div></PageShell>);
}

function ContactPage({ onBack }) {
  const[form,setForm]=useState({name:"",email:"",subject:"",message:""});const[sending,setSending]=useState(false);const[done,setDone]=useState(false);
  const update=(k,v)=>setForm(p=>({...p,[k]:v}));const valid=form.name&&form.email&&form.subject&&form.message;
  async function submit(){if(!valid)return;setSending(true);await new Promise(r=>setTimeout(r,900));setDone(true);setSending(false);}
  if(done)return(<PageShell onBack={onBack}><div className="bg-[#0d1220] border border-white/8 rounded-3xl p-10 text-center"><div className="text-5xl mb-4">📬</div><h2 className="font-display text-2xl font-extrabold mb-2">Message Received!</h2><p className="text-slate-400 text-sm">I'll reply within 48 hours to <strong className="text-slate-200">{form.email}</strong>.</p><button onClick={onBack} className="mt-8 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold transition-all">Back to Home</button></div></PageShell>);
  return(<PageShell onBack={onBack}><Tag color="emerald">Contact</Tag><h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-2 tracking-tight">Get in Touch</h1><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">{[{e:"📧",l:"Email",v:"umar24nov@gmail.com",h:"mailto:umar24nov@gmail.com"},{e:"🐙",l:"GitHub",v:"umar24nov",h:"https://github.com/umar24nov"},{e:"💼",l:"LinkedIn",v:"mohammadumarfarook",h:"https://www.linkedin.com/in/mohammadumarfarook"}].map(c=><a key={c.l} href={c.h} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-[#0d1220] border border-white/8 rounded-2xl px-4 py-3.5 hover:border-white/20 transition-all"><span className="text-2xl shrink-0">{c.e}</span><div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{c.l}</div><div className="text-xs text-slate-300 mt-0.5 truncate">{c.v}</div></div></a>)}</div><div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[["Name","name","text","Your name"],["Email","email","email","you@email.com"]].map(([l,k,t,p])=><div key={k}><label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{l} <span className="text-red-400">*</span></label><input type={t} value={form[k]} onChange={e=>update(k,e.target.value)} placeholder={p} className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"/></div>)}</div><div><label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Subject <span className="text-red-400">*</span></label><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">{["Bug Report","Feature Request","General Query","Feedback"].map(s=><button key={s} onClick={()=>update("subject",s)} className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${form.subject===s?"border-blue-500 bg-blue-500/10 text-blue-300":"border-white/10 text-slate-400 hover:border-white/20"}`}>{s}</button>)}</div><input value={form.subject} onChange={e=>update("subject",e.target.value)} placeholder="Or type your own..." className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"/></div><div><label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Message <span className="text-red-400">*</span></label><textarea rows={5} value={form.message} onChange={e=>update("message",e.target.value)} placeholder="Write your message here..." className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"/></div><button onClick={submit} disabled={!valid||sending} className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${valid&&!sending?"bg-gradient-to-r from-blue-500 to-violet-600 hover:-translate-y-0.5":"bg-white/5 text-slate-600 cursor-not-allowed"}`}>{sending?"Sending…":valid?"Send Message →":"Fill all required fields"}</button></div></PageShell>);
}

function ResourcePage({ onBack, tag, title, subtitle, items }) {
  return(<PageShell onBack={onBack}><Tag color="emerald">{tag}</Tag><h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-2 tracking-tight">{title}</h1><p className="text-slate-400 text-sm mb-8">{subtitle}</p><div className="space-y-4">{items.map(([icon,t,desc,link])=><div key={t} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all flex gap-4"><div className="text-2xl shrink-0">{icon}</div><div className="flex-1"><h3 className="font-bold text-sm mb-1 text-white">{t}</h3><p className="text-xs text-slate-400 leading-relaxed">{desc}</p>{link&&typeof link==="string"&&link&&<a href={link.startsWith("http")?link:`https://${link}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 mt-1.5 inline-block">{link.replace("https://","")} →</a>}{link&&typeof link==="number"&&<p className="text-sm font-bold text-blue-400 mt-1.5">📞 {link}</p>}</div></div>)}</div></PageShell>);
}

// ─── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ page, onHome, onStartQuiz, onNavigate }) {
  const [open, setOpen] = useState(false);
  const navClick = useCallback((id) => {
    setOpen(false);
    if (page !== "home") { onHome(); setTimeout(() => smoothScrollTo(id), 150); }
    else smoothScrollTo(id);
  }, [page, onHome]);

  return (
    <nav className="sticky top-0 z-50 bg-[#080b14]/90 backdrop-blur-xl border-b border-white/8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <button onClick={() => { setOpen(false); onHome(); window.scrollTo({top:0,behavior:"smooth"}); }}
          className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-base shrink-0">🎓</div>
          AcademicAI
        </button>
        <div className="hidden md:flex items-center gap-5">
          {[["how-it-works","How it Works"],["stats","Stats"],["reviews","Reviews"],["faq","FAQ"]].map(([id,l]) => (
            <button key={id} onClick={() => navClick(id)} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">{l}</button>
          ))}
          <button onClick={() => { setOpen(false); onNavigate("rateus"); }} className="text-sm font-medium text-yellow-400 hover:text-yellow-300 transition-colors">★ Rate Us</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setOpen(false); onStartQuiz(); }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 hover:shadow-lg transition-all whitespace-nowrap">
            Check My Score →
          </button>
          <button onClick={() => setOpen(o => !o)} className="md:hidden w-9 h-9 flex flex-col justify-center items-center gap-1.5">
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all origin-center ${open?"rotate-45 translate-y-2":""}`}/>
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all ${open?"opacity-0":""}`}/>
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all origin-center ${open?"-rotate-45 -translate-y-2":""}`}/>
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden bg-[#0d1220] border-t border-white/8 px-5 py-4 flex flex-col gap-3">
          {[["how-it-works","How it Works"],["stats","Stats"],["reviews","Reviews"],["faq","FAQ"]].map(([id,l]) => (
            <button key={id} onClick={() => navClick(id)} className="text-sm font-medium text-slate-300 hover:text-white text-left py-1 transition-colors">{l}</button>
          ))}
          <button onClick={() => { setOpen(false); onNavigate("rateus"); }} className="text-sm font-medium text-yellow-400 text-left py-1">★ Rate Us</button>
        </div>
      )}
    </nav>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────
function Footer({ onNavigate, onStartQuiz, onScrollTo }) {
  const go = (p) => { onNavigate(p); window.scrollTo({top:0,behavior:"smooth"}); };
  return (
    <footer className="relative z-10 border-t border-white/8 bg-[#06080f]/90 pt-12 pb-8 mt-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 font-bold text-lg mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">🎓</div>AcademicAI
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">AI-powered student performance prediction. Know your standing, take action, succeed.</p>
          </div>
          <div><h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Product</h4>
            {[["Start Prediction",()=>onStartQuiz()],["How It Works",()=>onScrollTo("how-it-works")],["Accuracy Stats",()=>onScrollTo("stats")],["FAQ",()=>onScrollTo("faq")],["★ Rate Us",()=>go("rateus"),"text-yellow-500 hover:text-yellow-400"]].map(([l,fn,cls=""]) => (
              <button key={l} onClick={fn} className={`block text-sm mb-2 transition-colors text-left w-full ${cls||"text-slate-500 hover:text-slate-300"}`}>{l}</button>
            ))}</div>
          <div><h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Resources</h4>
            {[["Study Tips","studytips"],["Attendance Guide","attendance"],["Scholarship Info","scholarship"],["Counseling Help","counseling"]].map(([l,p]) => (
              <button key={l} onClick={() => go(p)} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">{l}</button>
            ))}</div>
          <div><h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Company</h4>
            {[["About Us","about"],["Privacy Policy","privacy"],["Terms of Use","terms"],["Contact","contact"]].map(([l,p]) => (
              <button key={l} onClick={() => go(p)} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">{l}</button>
            ))}</div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/8">
          <span className="text-xs text-slate-500">
            © 2025 AcademicAI · Built by{" "}
            <a href="https://www.linkedin.com/in/mohammadumarfarook" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">Mohammad Umar</a>
            {" "}(B.Tech CSE)
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {["⚡ Free Forever","🤖 AI Powered","🎓 Made for University Students"].map(b => (
              <span key={b} className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/8 text-slate-400">{b}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page,    setPage]    = useState("home");
  const [answers, setAnswers] = useState({});
  const [qIndex,  setQIndex]  = useState(0);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Recompute question list whenever answers change (drives dynamic grade Qs)
  const questions = buildQuestions(answers);
  const current   = questions[qIndex];
  const isLast    = qIndex === questions.length - 1;
  const ans       = answers[current?.id];

  const canNext = current?.optional
    ? true
    : (current?.type === "number" ? (ans !== undefined && ans !== "") : !!ans);

  // Scroll to top on page change
  useEffect(() => { window.scrollTo({top:0,behavior:"smooth"}); }, [page]);

  function select(val) { setAnswers(p => ({...p, [current.id]: val})); }
  function goBack()    { if (qIndex > 0) setQIndex(i => i-1); }
  function goNext()    { if (!canNext) return; if (isLast) { submitPrediction(); return; } setQIndex(i => i+1); }

  // Enter key advances quiz (no hint shown, but still works)
  useEffect(() => {
    if (page !== "quiz") return;
    const fn = (e) => { if (e.key === "Enter") goNext(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [page, qIndex, canNext, answers]);

  async function submitPrediction() {
    setLoading(true); setError(null); setPage("quiz");
    try {
      const payload = buildPayload(answers);
      const res = await fetch(`${API_URL}/predict`, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `Error ${res.status}`); }
      const data = await res.json();
      setResult(data);
      await saveResponse(answers, data);
      setPage("result");
    } catch(e) { setError(e.message); }
    finally    { setLoading(false); }
  }

  function startQuiz() { setPage("quiz"); setQIndex(0); setAnswers({}); setResult(null); setError(null); }
  function goHome()    { setPage("home"); }
  function navigate(p){ setPage(p); }
  function handleScrollTo(id) {
    if (page !== "home") { setPage("home"); setTimeout(() => smoothScrollTo(id), 150); }
    else smoothScrollTo(id);
  }

  const STATIC = ["about","privacy","terms","contact","studytips","attendance","scholarship","counseling","rateus"];

  return (
    <div className="min-h-screen bg-[#060810] text-slate-100" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        .font-display { font-family:'Syne',sans-serif; }
        button,a,[role="button"] { cursor:pointer!important; }
        @keyframes blink  { 0%,100%{opacity:1}50%{opacity:.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)} }
        @keyframes popIn  { from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .animate-blink  { animation:blink 2s infinite; }
        .animate-fadeUp { animation:fadeUp .4s ease both; }
        .animate-popIn  { animation:popIn .45s cubic-bezier(.175,.885,.32,1.275) both; }
        .spinner        { animation:spin .75s linear infinite; }
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:99px;}
      `}</style>

      <div className="fixed inset-0 pointer-events-none z-0"
        style={{background:"radial-gradient(ellipse 60% 40% at 15% 0%,rgba(79,142,247,.09),transparent 60%),radial-gradient(ellipse 50% 35% at 85% 100%,rgba(139,92,246,.07),transparent 55%)"}}/>

      <Navbar page={page} onHome={goHome} onStartQuiz={startQuiz} onNavigate={navigate}/>

      {/* Static pages */}
      {STATIC.includes(page) && (
        <div className="relative z-10">
          {page==="rateus"     && <RateUsPage onBack={goHome}/>}
          {page==="about"      && <AboutPage  onBack={goHome}/>}
          {page==="contact"    && <ContactPage onBack={goHome}/>}
          {page==="privacy"    && <LegalPage onBack={goHome} title="Privacy Policy" tag="Legal" sections={[
            ["What we collect","Your anonymised quiz responses — grades, attendance, and background. We do NOT collect your name, email, or any personal identifiers."],
            ["Why we collect it","To retrain and improve AcademicAI's ML model over time. More responses = better predictions for all students."],
            ["Storage","Responses are stored in a CSV file on our server. No identity information is ever included."],
            ["How it's used","Only for model retraining. We never sell, share, or use your data for advertising."],
            ["Third parties","We never share your data with any third party."],
            ["Contact","Questions about privacy? Reach us at umar24nov@gmail.com"],
          ]}/>}
          {page==="terms"      && <LegalPage onBack={goHome} title="Terms of Use" tag="Legal" sections={[
            ["Acceptance","By using AcademicAI you agree to these terms."],
            ["Nature of predictions","Results are AI estimates for informational purposes only — not professional academic advice."],
            ["Data consent","Submitting the quiz consents to your anonymised data being stored as per our Privacy Policy."],
            ["Accuracy","81% test accuracy — approximately 1 in 5 predictions may be incorrect. Use as a guide, not a verdict."],
            ["Free service","AcademicAI is free to use. No registration required."],
          ]}/>}
          {page==="studytips"  && <ResourcePage onBack={goHome} tag="Resources" title="Study Tips" subtitle="Evidence-based habits to help you pass and graduate." items={[["✅","Attend every class","Attendance is the #1 predictor of academic success. Showing up beats cramming every time."],["📅","Plan your semester in week 1","Map all deadlines and exam dates on day one. Students who plan ahead rarely fall behind."],["👥","Form a study group","Students in groups perform 15–20% better on average. Find 2–3 serious classmates."],["🎯","Focus on your weakest subject","Spend the most time where you're weakest, not on what you already know."],["🧠","Sleep before exams","7–8 hours beats any all-nighter. Memory consolidation happens during sleep."],["📵","Phone-free study blocks","30 focused minutes beats 2 hours of half-attention."],["🏃","Exercise 20 minutes daily","Physical activity directly improves focus and memory retention."],["🗣️","Talk to your teacher early","Don't wait until exams — ask for help early in the semester."]]}/>}
          {page==="attendance" && <ResourcePage onBack={goHome} tag="Resources" title="Attendance Guide" subtitle="Why it matters and how to recover." items={[["📊","The 75% Rule","Most colleges require 75% minimum attendance to sit for exams. Below this, you may be debarred."],["🤖","What our model found","Attendance is the most important predictor in our AI model — more than grades or family background."],["📱","Track daily","Check your attendance on your college portal daily."],["🤝","Communicate proactively","If you must miss class, message your teacher beforehand."],["🔄","Recovery formula","Required classes = (0.75 × Total − Attended) ÷ 0.25"],["🏥","Medical leave","Most colleges grant condonation for certified medical absence. Keep all documents."]]}/>}
          {page==="scholarship"&& <ResourcePage onBack={goHome} tag="Resources" title="Scholarship Info" subtitle="Major scholarships available to students." items={[["🏛️","NSP — National Scholarship Portal","India's largest scholarship platform covering pre-matric, post-matric, and merit-cum-means schemes.","scholarships.gov.in"],["🎓","AICTE Pragati Scholarship","For girl students in AICTE technical institutes. ₹50,000/year.","aicte-india.org"],["💡","Inspire Scholarship (DST)","For basic science students in top 1% of board exams. ₹80,000/year.","online-inspire.gov.in"],["🌿","PM Scholarship (Ex-Servicemen)","For children of ex-servicemen. ₹2,500–3,000/month.","ksb.gov.in"],["📚","Vidyasaarathi Portal","Industry scholarships from TCS, Infosys, HDFC and more.","vidyasaarathi.co.in"],["🏅","State Government Schemes","Every state has SC/ST/OBC/minority scholarships. Check your state social welfare portal.",""]]}/>}
          {page==="counseling" && <ResourcePage onBack={goHome} tag="Resources" title="Counseling Help" subtitle="You don't have to figure it out alone." items={[["🧠","iCall (TISS)","Free mental health helpline by Tata Institute of Social Sciences.",9152987821],["💬","Vandrevala Foundation","24x7 confidential helpline in English and Hindi.",18602662345],["🎓","Your College Counselor","All UGC colleges must have a student counseling cell.",""],["📞","iYouth","Youth helpline for career and academic guidance. Weekdays, free.",8800444888],["💡","What to talk about","Attendance issues, exam anxiety, fee problems, family pressure — all valid reasons to reach out.",""]]}/>}
          <Footer onNavigate={navigate} onStartQuiz={startQuiz} onScrollTo={handleScrollTo}/>
        </div>
      )}

      {/* Home page */}
      {page === "home" && (
        <div className="relative z-10">
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fadeUp">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-blink shrink-0"/>
                <span className="text-xs font-bold text-blue-400 tracking-widest uppercase">AI-Powered · Free · Instant</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-5">
                Will You<br/><span className="bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">Pass This Year?</span>
              </h1>
              <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
                Answer a few honest questions. Our AI tells you if you're on track to <strong className="text-white">Pass</strong>, at risk of <strong className="text-orange-400">Failing</strong>, or need urgent help.
              </p>
              <div className="flex flex-wrap gap-3 mb-10">
                <button onClick={startQuiz} className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 font-bold text-base hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/40 transition-all">🔮 Predict My Performance</button>
                <button onClick={() => smoothScrollTo("how-it-works")} className="px-6 py-3.5 rounded-2xl border border-white/15 font-bold text-base text-slate-300 hover:border-white/30 hover:text-white transition-all">See How It Works</button>
              </div>
              <div className="flex gap-8">{[["395+","Students in dataset"],["81%","Model accuracy"],["~3 min","To complete"]].map(([n,l]) => (
                <div key={l}><div className="text-2xl font-extrabold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">{n}</div><div className="text-xs text-slate-500 mt-0.5">{l}</div></div>
              ))}</div>
            </div>
            <div className="relative hidden lg:block">
              <div className="absolute -top-4 right-6 bg-[#0d1220] border border-white/15 rounded-xl px-4 py-2 text-sm font-semibold text-emerald-400 shadow-xl z-10">🎓 Pass · 88% confidence</div>
              <div className="bg-[#0d1220] border border-white/12 rounded-3xl p-7 shadow-2xl">
                <div className="flex items-center justify-between mb-5"><span className="font-bold text-sm">Performance Report</span><span className="text-xs font-bold bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-lg">● Live</span></div>
                {[["Pass","#34d399",88],["Fail","#fb923c",9],["At-Risk","#f87171",3]].map(([l,c,p]) => (
                  <div key={l} className="flex items-center gap-3 mb-3"><span className="text-xs text-slate-400 w-14 shrink-0">{l}</span><div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${p}%`,background:c}}/></div><span className="text-xs font-bold text-slate-400 w-8 text-right">{p}%</span></div>
                ))}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/8 text-xs"><span className="text-emerald-400 font-bold">🎓 Predicted: Pass</span><span className="text-slate-500">RF · 81% acc</span></div>
              </div>
              <div className="absolute -bottom-4 left-6 bg-[#0d1220] border border-white/15 rounded-xl px-4 py-2 text-sm font-semibold text-blue-400 shadow-xl">⚡ Powered by Machine Learning</div>
            </div>
          </section>

          <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-white/6">
            <Tag color="violet">How It Works</Tag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-10 tracking-tight">Simple. Smart. Honest.</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[["1","Answer Questions","Tell us about your grades, attendance, family background, and study habits."],["2","AI Analyses","Random Forest model (trained on 395 real students) processes your answers instantly."],["3","Get Prediction","See Pass, Fail, or At-Risk with confidence percentages for each outcome."],["4","Take Action","Get personalised advice on what to change before results are final."]].map(([n,t,d]) => (
                <div key={n} className="bg-[#0d1220] border border-white/8 rounded-2xl p-6 hover:border-white/15 hover:-translate-y-1 transition-all">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-extrabold text-sm mb-4">{n}</div>
                  <h3 className="font-bold text-sm mb-2">{t}</h3><p className="text-xs text-slate-400 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="stats" className="bg-gradient-to-r from-blue-500/6 to-violet-500/6 border-y border-white/6 py-12">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[["395","Students in training data"],["81%","Test accuracy"],["Dynamic","Grade questions"],["3","Outcome classes"]].map(([n,l]) => (
                <div key={l}><div className="font-display text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">{n}</div><div className="text-xs text-slate-400 mt-1.5">{l}</div></div>
              ))}
            </div>
          </section>

          <section id="reviews" className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <Tag color="blue">Student Reviews</Tag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-10 tracking-tight">What Students Say</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[{s:"★★★★★",t:"Predicted At-Risk — I had skipped too many classes and failed 2 courses. Wake-up call I needed.",n:"Arjun K.",r:"B.Tech 2nd Year",e:"👦",c:"from-blue-900/40"},{s:"★★★★★",t:"Predicted Pass with 88% confidence. Questions felt accurate. Really well designed.",n:"Sneha P.",r:"BSc 3rd Year",e:"👧",c:"from-violet-900/40"},{s:"★★★★☆",t:"The Pass/Fail/At-Risk breakdown with percentages was very clear.",n:"Rahul M.",r:"BBA 2nd Year",e:"👦",c:"from-emerald-900/30"},{s:"★★★★★",t:"Free ML tool that actually works. Showed me attendance matters more than I thought.",n:"Priya S.",r:"MBA 1st Year",e:"👧",c:"from-blue-900/40"},{s:"★★★★★",t:"Free and genuinely useful. Impressive that a student built this.",n:"Vikram R.",r:"B.Com Final Year",e:"👦",c:"from-violet-900/40"},{s:"★★★★☆",t:"Asked the right questions — study time, attendance, parent education. Felt relevant.",n:"Meera T.",r:"BCA 2nd Year",e:"👧",c:"from-emerald-900/30"}].map((t,i) => (
                <div key={i} className={`bg-gradient-to-b ${t.c} to-transparent bg-[#0d1220] border border-white/8 rounded-2xl p-6`}>
                  <div className="text-yellow-400 text-sm mb-3">{t.s}</div>
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">"{t.t}"</p>
                  <div className="flex items-center gap-3 pt-4 border-t border-white/6">
                    <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-base shrink-0">{t.e}</div>
                    <div><div className="text-sm font-bold">{t.n}</div><div className="text-xs text-slate-500">{t.r}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
            <div className="bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/20 rounded-3xl p-10 sm:p-14 text-center">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Ready to Know Where You Stand?</h2>
              <p className="text-slate-400 text-base max-w-md mx-auto mb-8">Free, takes a few minutes, and might change how you approach your studies.</p>
              <button onClick={startQuiz} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 font-bold text-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/40 transition-all">🔮 Start My Prediction</button>
            </div>
          </section>

          <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-white/6">
            <Tag color="emerald">FAQ</Tag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-10 tracking-tight">Common Questions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[["Is this free?","Yes, 100% free. No sign-up or email required."],["How accurate is it?","81% test accuracy on real student data."],["What does At-Risk mean?","Students critically at risk of failing or withdrawing entirely."],["How do grade questions work?","They adapt based on which semester you're in — Sem 1 students are asked about 12th/Intermediate marks instead."],["Are grades out of 10?","Yes — select the range matching your marks out of 10 (e.g. 7–8)."],["Can I retake the quiz?","Yes, click Retry on the result page."]].map(([q,a],i) => (
                <div key={i} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
                  <div className="font-bold text-sm mb-2">{q}</div><div className="text-xs text-slate-400 leading-relaxed">{a}</div>
                </div>
              ))}
            </div>
          </section>

          <Footer onNavigate={navigate} onStartQuiz={startQuiz} onScrollTo={handleScrollTo}/>
        </div>
      )}

      {/* Quiz & Result */}
      {(page === "quiz" || page === "result") && (
        <div className="relative z-10 max-w-xl mx-auto px-4 sm:px-6 py-8 pb-24 min-h-screen">
          <button onClick={goHome} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6">← Back to Home</button>

          {loading && (
            <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-12 text-center animate-fadeUp">
              <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-400 rounded-full spinner mx-auto mb-5"/>
              <p className="font-bold text-lg mb-2">Analysing your academic profile…</p>
              <p className="text-slate-400 text-sm">Our AI is crunching the numbers ✨</p>
            </div>
          )}

          {page === "result" && result && !loading && (
            <ResultCard result={result} onRetry={startQuiz} onHome={goHome} onRate={() => navigate("rateus")}/>
          )}

          {page === "quiz" && !loading && current && (
            <>
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400 font-medium">{current.section}</span>
                  <span className="text-blue-400 font-bold">{qIndex+1} / {questions.length}</span>
                </div>
                <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{width:`${Math.round((qIndex/questions.length)*100)}%`}}/>
                </div>
              </div>

              <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 animate-fadeUp">
                <div className="text-xs font-bold tracking-widest uppercase text-blue-400 mb-2">{current.icon} {current.section}</div>
                <p className="text-lg sm:text-xl font-bold leading-snug mb-1.5">{current.q}</p>
                {current.hint && <p className="text-sm text-slate-400 mb-5 leading-relaxed">{current.hint}</p>}
                {!current.hint && <div className="mb-5"/>}

                {current.type === "choice" && <ChoiceGrid options={current.options} cols={current.cols} value={ans} onSelect={select}/>}
                {current.type === "yesno"  && <YesNoInput value={ans} onSelect={select}/>}
                {current.type === "number" && <NumberInput value={ans} min={current.min} max={current.max} placeholder={current.placeholder} onChange={v => select(v)}/>}

                {error && <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-sm text-red-300">⚠️ {error}</div>}

                <div className="flex gap-3 mt-6">
                  {qIndex > 0 && (
                    <button onClick={goBack} className="px-5 py-3 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:border-white/20 hover:text-white transition-all">← Back</button>
                  )}
                  <button onClick={goNext} disabled={!canNext}
                    className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all
                      ${isLast ? "bg-gradient-to-r from-emerald-500 to-violet-600" : "bg-gradient-to-r from-blue-500 to-violet-600"}
                      ${canNext ? "hover:-translate-y-0.5 hover:shadow-lg" : "opacity-35 cursor-not-allowed"}`}>
                    {isLast ? "🔮 Predict My Performance" : "Continue →"}
                  </button>
                </div>

                {current.optional && (
                  <div className="text-center mt-3">
                    <button onClick={() => setQIndex(i => i+1)} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
                      Skip this →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
